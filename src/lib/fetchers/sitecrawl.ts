/**
 * 全站爬取模块
 *
 * 负责：
 * 1. 从种子 URL 发现链接
 * 2. URL 过滤和去重
 * 3. 深度控制
 * 4. 触发内容抓取
 */

import { JSDOM } from 'jsdom'
import { prisma } from '../prisma'
import { getUnifiedFetcher } from './unified-fetcher'
import {
  normalizeUrl,
  isSameDomain,
  isCrawlableUrl,
  toAbsoluteUrl
} from '../utils/url-normalizer'
import { addCrawlDiscoveryJobs, addFetchJobs } from '../queue/queues'
import { publishJobStatus } from '../queue/redis'
import type { SiteCrawlConfig } from './types'

/**
 * 链接发现结果
 */
export interface DiscoveredLink {
  /** 完整 URL */
  url: string
  /** 标准化 URL（用于去重） */
  normalizedUrl: string
  /** 链接文本 */
  title?: string
}

/**
 * 从页面 HTML 中提取链接
 *
 * @param html - 页面 HTML
 * @param baseUrl - 基础 URL（用于转换相对路径）
 * @param config - 爬取配置
 * @returns 发现的链接列表
 */
export function extractLinks(
  html: string,
  baseUrl: string,
  config: SiteCrawlConfig
): DiscoveredLink[] {
  const dom = new JSDOM(html, { url: baseUrl })
  const document = dom.window.document

  // 确定链接提取范围
  const container = config.contentSelector
    ? document.querySelector(config.contentSelector)
    : document

  if (!container) return []

  const selector = config.linkSelector || 'a[href]'
  const anchors = container.querySelectorAll(selector)

  const links: DiscoveredLink[] = []
  const seen = new Set<string>()

  anchors.forEach((anchor: Element) => {
    const href = (anchor as HTMLAnchorElement).href
    if (!href) return

    // 转换为绝对 URL
    const absoluteUrl = toAbsoluteUrl(href, baseUrl)
    if (!absoluteUrl) return

    // 检查是否可爬取
    if (!isCrawlableUrl(absoluteUrl)) return

    // 标准化
    const normalized = normalizeUrl(absoluteUrl)

    // 跳过已见过的
    if (seen.has(normalized)) return
    seen.add(normalized)

    // 同域名检查
    if (config.sameDomainOnly !== false) {
      if (!isSameDomain(absoluteUrl, baseUrl, config.allowedSubdomains)) {
        return
      }
    }

    // 包含规则
    if (config.includePatterns?.length) {
      const matches = config.includePatterns.some(p => {
        try {
          return new RegExp(p).test(absoluteUrl)
        } catch {
          return absoluteUrl.includes(p)
        }
      })
      if (!matches) return
    }

    // 排除规则
    if (config.excludePatterns?.length) {
      const excluded = config.excludePatterns.some(p => {
        try {
          return new RegExp(p).test(absoluteUrl)
        } catch {
          return absoluteUrl.includes(p)
        }
      })
      if (excluded) return
    }

    links.push({
      url: absoluteUrl,
      normalizedUrl: normalized,
      title: anchor.textContent?.trim() || undefined
    })
  })

  return links
}

/**
 * 发现单个页面的链接
 *
 * @param sourceId - 信息源 ID
 * @param url - 要爬取的 URL
 * @param currentDepth - 当前深度
 * @param config - 爬取配置
 * @param jobId - 任务 ID（用于状态通知）
 * @returns 发现和入队的链接数量
 */
export async function discoverPage(
  sourceId: string,
  url: string,
  currentDepth: number,
  config: SiteCrawlConfig,
  jobId: string
): Promise<{ discovered: number; queued: number }> {
  const maxDepth = config.maxDepth ?? 3
  const maxUrls = config.maxUrls ?? 1000

  // 检查是否超过最大 URL 数
  const existingCount = await prisma.crawlUrl.count({
    where: { sourceId }
  })

  if (existingCount >= maxUrls) {
    console.log(`[SiteCrawl] ${sourceId}: 已达到最大 URL 数 ${maxUrls}`)
    return { discovered: 0, queued: 0 }
  }

  // 抓取页面 - 使用 fetchRaw 获取原始 HTML（不经过 Readability 处理）
  const fetcher = getUnifiedFetcher()
  const result = await fetcher.fetchRaw(url, {
    sourceId,
    timeout: 30000
  })

  if (!result.success) {
    console.warn(`[SiteCrawl] 抓取失败: ${url} - ${result.error}`)
    return { discovered: 0, queued: 0 }
  }

  // 提取链接
  const html = result.body || ''
  const links = extractLinks(html, result.finalUrl || url, config)

  // 限制新增数量，避免超过 maxUrls
  const remainingSlots = maxUrls - existingCount
  const linksToInsert = links.slice(0, remainingSlots)

  if (linksToInsert.length === 0) {
    return { discovered: 0, queued: 0 }
  }

  // 批量插入 - 使用 createMany 跳过重复项
  // 注意：SQLite 的 createMany 不支持 skipDuplicates，需要用事务处理
  const insertData = linksToInsert.map(link => ({
    sourceId,
    url: link.url,
    normalizedUrl: link.normalizedUrl,
    depth: currentDepth + 1,
    title: link.title,
    parentUrl: url,
    status: 'pending' as const
  }))

  // 使用事务批量插入，忽略重复
  let discovered = 0
  const newLinks: DiscoveredLink[] = []

  // 先查询已存在的 URL
  const existingUrls = await prisma.crawlUrl.findMany({
    where: {
      sourceId,
      normalizedUrl: { in: linksToInsert.map(l => l.normalizedUrl) }
    },
    select: { normalizedUrl: true }
  })
  const existingSet = new Set(existingUrls.map(u => u.normalizedUrl))

  // 过滤出真正需要插入的
  const toInsert = insertData.filter(d => !existingSet.has(d.normalizedUrl))

  if (toInsert.length > 0) {
    // 批量插入 - 已在上面过滤掉重复项
    await prisma.crawlUrl.createMany({
      data: toInsert
    })
    discovered = toInsert.length
    newLinks.push(...linksToInsert.filter(l => !existingSet.has(l.normalizedUrl)))
  }

  // 继续发现（深度控制）- 只有未达到最大深度才继续
  let queued = 0
  if (currentDepth < maxDepth && newLinks.length > 0) {
    const toDiscover = newLinks.map(l => ({
      jobId,
      sourceId,
      url: l.url,
      depth: currentDepth + 1
    }))

    await addCrawlDiscoveryJobs(toDiscover)
    queued = toDiscover.length
  }

  return { discovered, queued }
}

/**
 * 启动全站爬取
 *
 * 入口函数，创建种子任务
 *
 * @param sourceId - 信息源 ID
 * @param jobId - 任务 ID
 * @returns 操作结果
 */
export async function startSiteCrawl(
  sourceId: string,
  jobId: string
): Promise<{ success: boolean; message: string }> {
  const source = await prisma.source.findUnique({
    where: { id: sourceId }
  })

  if (!source || source.type !== 'sitecrawl') {
    return { success: false, message: 'Invalid source type' }
  }

  // 解析配置
  const config: SiteCrawlConfig = source.config
    ? JSON.parse(source.config).siteCrawl || {}
    : {}

  // 创建种子 URL 记录
  const normalized = normalizeUrl(source.url)

  try {
    await prisma.crawlUrl.create({
      data: {
        sourceId,
        url: source.url,
        normalizedUrl: normalized,
        depth: 0,
        status: 'pending'
      }
    })
  } catch {
    // 已存在，继续
  }

  // 推送发现任务
  await addCrawlDiscoveryJobs([
    {
      jobId,
      sourceId,
      url: source.url,
      depth: 0
    }
  ])

  // 发布开始状态
  await publishJobStatus({
    jobId,
    sourceId,
    type: 'crawl_discovery',
    status: 'started',
    timestamp: Date.now()
  })

  return { success: true, message: '爬取任务已启动' }
}

/**
 * 将已发现的 URL 转换为文章抓取任务
 *
 * 在发现阶段完成后调用
 * 处理所有 completed 状态且尚未关联文章的 CrawlUrl
 *
 * @param sourceId - 信息源 ID
 * @param jobId - 任务 ID
 * @returns 入队的文章数量
 */
export async function triggerContentFetch(
  sourceId: string,
  jobId: string
): Promise<number> {
  // 获取所有已完成发现但尚未创建文章的 CrawlUrl
  const urlsToProcess = await prisma.crawlUrl.findMany({
    where: {
      sourceId,
      status: 'completed',
      articleId: null
    },
    take: 500 // 增加批量处理数量
  })

  if (urlsToProcess.length === 0) {
    console.log(`[SiteCrawl] ${sourceId}: 没有待抓取的 URL`)
    return 0
  }

  console.log(`[SiteCrawl] ${sourceId}: 开始为 ${urlsToProcess.length} 个 URL 创建文章`)

  // 批量创建文章 - 先查询已存在的
  const existingArticles = await prisma.article.findMany({
    where: {
      sourceId,
      externalId: { in: urlsToProcess.map(u => u.normalizedUrl) }
    },
    select: { id: true, externalId: true }
  })
  const existingMap = new Map(existingArticles.map(a => [a.externalId, a.id]))

  // 分离需要创建和已存在的
  const toCreate: { sourceId: string; externalId: string; title: string; url: string; contentStatus: string }[] = []
  const crawlUrlUpdates: { crawlUrlId: string; articleId: string }[] = []

  for (const crawlUrl of urlsToProcess) {
    const existingId = existingMap.get(crawlUrl.normalizedUrl)
    if (existingId) {
      // 文章已存在，只需关联
      crawlUrlUpdates.push({ crawlUrlId: crawlUrl.id, articleId: existingId })
    } else {
      toCreate.push({
        sourceId,
        externalId: crawlUrl.normalizedUrl,
        title: crawlUrl.title || crawlUrl.url,
        url: crawlUrl.url,
        contentStatus: 'pending'
      })
    }
  }

  // 批量创建新文章
  if (toCreate.length > 0) {
    await prisma.article.createMany({
      data: toCreate
    })

    // 查询新创建的文章 ID
    const newArticles = await prisma.article.findMany({
      where: {
        sourceId,
        externalId: { in: toCreate.map(a => a.externalId) }
      },
      select: { id: true, externalId: true, url: true }
    })

    // 建立 externalId -> articleId 映射
    const newArticleMap = new Map(newArticles.map(a => [a.externalId, a]))

    // 更新 crawlUrl 关联
    for (const crawlUrl of urlsToProcess) {
      const article = newArticleMap.get(crawlUrl.normalizedUrl)
      if (article) {
        crawlUrlUpdates.push({ crawlUrlId: crawlUrl.id, articleId: article.id })
      }
    }
  }

  // 批量更新 CrawlUrl 关联文章 ID
  if (crawlUrlUpdates.length > 0) {
    // 使用事务批量更新
    await prisma.$transaction(
      crawlUrlUpdates.map(({ crawlUrlId, articleId }) =>
        prisma.crawlUrl.update({
          where: { id: crawlUrlId },
          data: { articleId }
        })
      )
    )
  }

  // 直接从 crawlUrlUpdates 构建抓取任务列表（避免重复查询）
  // 建立 crawlUrlId -> crawlUrl 的映射
  const crawlUrlMap = new Map(urlsToProcess.map(u => [u.id, u]))
  const jobs: { articleId: string; url: string; sourceId: string }[] = []

  for (const { crawlUrlId, articleId } of crawlUrlUpdates) {
    const crawlUrl = crawlUrlMap.get(crawlUrlId)
    if (crawlUrl) {
      jobs.push({ articleId, url: crawlUrl.url, sourceId })
    }
  }

  // 批量推送到 FetchWorker 队列
  if (jobs.length > 0) {
    await addFetchJobs(jobs)
  }

  // 发布进度
  await publishJobStatus({
    jobId,
    sourceId,
    type: 'crawl_discovery',
    status: 'progress',
    progress: {
      current: jobs.length,
      total: urlsToProcess.length,
      queued: jobs.length
    },
    timestamp: Date.now()
  })

  return jobs.length
}

/**
 * 获取全站爬取状态统计
 *
 * @param sourceId - 信息源 ID
 * @returns 各状态的 URL 数量
 */
export async function getCrawlStats(sourceId: string): Promise<{
  pending: number
  crawling: number
  completed: number
  failed: number
  total: number
}> {
  const stats = await prisma.crawlUrl.groupBy({
    by: ['status'],
    where: { sourceId },
    _count: true
  })

  const statusMap = stats.reduce(
    (acc, item) => {
      acc[item.status] = item._count
      return acc
    },
    {} as Record<string, number>
  )

  return {
    pending: statusMap.pending || 0,
    crawling: statusMap.crawling || 0,
    completed: statusMap.completed || 0,
    failed: statusMap.failed || 0,
    total: Object.values(statusMap).reduce((a, b) => a + b, 0)
  }
}
