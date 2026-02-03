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
import { addFetchJobs } from '../queue/queues'
import { publishJobStatus } from '../queue/redis'
import { domainScheduler, extractDomainFromUrl } from '../scheduler/domain-scheduler'
import type { SiteCrawlConfig, FetchStrategy } from './types'

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
 * @param seedUrl - 种子 URL（用于 seedPathOnly 过滤）
 * @returns 发现的链接列表
 */
export function extractLinks(
  html: string,
  baseUrl: string,
  config: SiteCrawlConfig,
  seedUrl?: string
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

  // 预计算种子路径前缀（用于 seedPathOnly 过滤）
  let seedPathPrefix: string | null = null
  if (config.seedPathOnly && seedUrl) {
    try {
      const seedUrlObj = new URL(seedUrl)
      // 路径前缀：包含完整路径（去掉末尾的 / 以便统一比较）
      seedPathPrefix = seedUrlObj.origin + seedUrlObj.pathname.replace(/\/$/, '')
    } catch {
      // 无效 URL，跳过 seedPathOnly 过滤
    }
  }

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

    // 种子路径前缀检查
    if (seedPathPrefix) {
      try {
        const urlObj = new URL(absoluteUrl)
        const urlPath = urlObj.origin + urlObj.pathname.replace(/\/$/, '')
        // URL 必须以种子路径为前缀
        if (!urlPath.startsWith(seedPathPrefix)) {
          return
        }
      } catch {
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
 * 抓取单个页面并提取链接
 *
 * @param url - 要爬取的 URL
 * @param config - 爬取配置
 * @param seedUrl - 种子 URL（用于 seedPathOnly 过滤）
 * @returns 发现的链接列表，失败返回空数组
 */
async function fetchAndExtractLinks(
  url: string,
  config: SiteCrawlConfig,
  seedUrl: string
): Promise<DiscoveredLink[]> {
  const domain = extractDomainFromUrl(url)

  // 使用 DomainScheduler 限流，避免触发封锁
  await domainScheduler.acquireWithWait(domain)

  try {
    const fetcher = getUnifiedFetcher()
    const result = await fetcher.fetchRaw(url, {
      timeout: 30000
    })

    if (!result.success) {
      console.warn(`[SiteCrawl] 抓取失败: ${url} - ${result.error}`)
      domainScheduler.reportFailure(domain)
      return []
    }

    domainScheduler.reportSuccess(domain)
    const html = result.body || ''
    return extractLinks(html, result.finalUrl || url, config, seedUrl)
  } finally {
    domainScheduler.release(domain)
  }
}

/**
 * 执行全站 BFS（广度优先） 发现（在单个任务内完成）
 *
 * 使用 BFS 循环替代队列递归，简化逻辑并避免状态不一致问题
 *
 * @param sourceId - 信息源 ID
 * @param seedUrl - 种子 URL
 * @param config - 爬取配置
 * @param jobId - 任务 ID（用于状态通知）
 * @returns 发现的总 URL 数量
 */
export async function discoverSite(
  sourceId: string,
  seedUrl: string,
  config: SiteCrawlConfig,
  jobId: string
): Promise<{ totalDiscovered: number; totalProcessed: number }> {
  const maxDepth = config.maxDepth ?? 3
  const maxUrls = config.maxUrls ?? 1000

  // 使用内存 Set 追踪已处理的 URL（避免重复）
  const processedUrls = new Set<string>()
  // BFS 队列：{ url, normalizedUrl, depth }
  const queue: Array<{ url: string; normalizedUrl: string; depth: number }> = []

  // 初始化种子 URL
  const seedNormalized = normalizeUrl(seedUrl)
  processedUrls.add(seedNormalized)
  queue.push({ url: seedUrl, normalizedUrl: seedNormalized, depth: 0 })

  let totalDiscovered = 0
  let totalProcessed = 0

  console.log(`[SiteCrawl] 开始 BFS 发现: ${seedUrl}, maxDepth=${maxDepth}, maxUrls=${maxUrls}`)

  // BFS 循环
  while (queue.length > 0 && processedUrls.size < maxUrls) {
    const { url, normalizedUrl, depth } = queue.shift()!
    totalProcessed++

    // 抓取并提取链接
    const links = await fetchAndExtractLinks(url, config, seedUrl)

    // 更新为 completed
    await prisma.crawlUrl.updateMany({
      where: { sourceId, normalizedUrl },
      data: { status: 'completed', crawledAt: new Date() }
    })

    // 只有未达到最大深度时才处理新链接
    if (depth >= maxDepth) {
      continue
    }

    // 过滤已处理的链接
    const newLinks = links.filter(l => !processedUrls.has(l.normalizedUrl))
    if (newLinks.length === 0) {
      continue
    }

    // 限制总数不超过 maxUrls
    const remainingSlots = maxUrls - processedUrls.size
    const linksToAdd = newLinks.slice(0, remainingSlots)

    // 批量插入 DB（先查询去重）
    const existingUrls = await prisma.crawlUrl.findMany({
      where: {
        sourceId,
        normalizedUrl: { in: linksToAdd.map(l => l.normalizedUrl) }
      },
      select: { normalizedUrl: true }
    })
    const existingSet = new Set(existingUrls.map(u => u.normalizedUrl))

    const toInsert = linksToAdd
      .filter(l => !existingSet.has(l.normalizedUrl))
      .map(link => ({
        sourceId,
        url: link.url,
        normalizedUrl: link.normalizedUrl,
        depth: depth + 1,
        title: link.title,
        parentUrl: url,
        status: 'completed' as const  // 直接标记为 completed，避免 pending 状态遗留
      }))

    if (toInsert.length > 0) {
      await prisma.crawlUrl.createMany({ data: toInsert })
      totalDiscovered += toInsert.length

      // 加入 BFS 队列继续发现
      for (const item of toInsert) {
        processedUrls.add(item.normalizedUrl)
        queue.push({ url: item.url, normalizedUrl: item.normalizedUrl, depth: depth + 1 })
      }
    }

    // 每处理 10 个 URL 发布一次进度
    if (totalProcessed % 10 === 0) {
      await publishJobStatus({
        jobId,
        sourceId,
        type: 'crawl_discovery',
        status: 'progress',
        progress: {
          current: totalProcessed,
          total: processedUrls.size,
          queued: totalDiscovered
        },
        timestamp: Date.now()
      })
    }
  }

  console.log(`[SiteCrawl] BFS 发现完成: processed=${totalProcessed}, discovered=${totalDiscovered}`)

  return { totalDiscovered, totalProcessed }
}

/**
 * 启动全站爬取
 *
 * 入口函数，执行 BFS 发现并触发内容抓取
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
  const parsedConfig = source.config ? JSON.parse(source.config) : {}
  const config: SiteCrawlConfig = parsedConfig.siteCrawl || {}
  const fetchStrategy = parsedConfig.fetch?.strategy

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

  // 发布开始状态
  await publishJobStatus({
    jobId,
    sourceId,
    type: 'crawl_discovery',
    status: 'started',
    timestamp: Date.now()
  })

  // 执行 BFS 发现（同步完成，不再使用队列递归）
  const { totalDiscovered, totalProcessed } = await discoverSite(
    sourceId,
    source.url,
    config,
    jobId
  )

  console.log(`[SiteCrawl] 发现完成: ${totalProcessed} processed, ${totalDiscovered} discovered`)

  // 触发内容抓取
  const fetchedCount = await triggerContentFetch(sourceId, jobId, fetchStrategy)

  // 发布完成状态
  await publishJobStatus({
    jobId,
    sourceId,
    type: 'crawl_discovery',
    status: 'completed',
    progress: {
      current: totalProcessed,
      total: totalDiscovered,
      queued: fetchedCount
    },
    timestamp: Date.now()
  })

  return { success: true, message: `发现 ${totalDiscovered} 个 URL，已入队 ${fetchedCount} 个抓取任务` }
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
  jobId: string,
  strategy?: FetchStrategy
): Promise<number> {
  let totalQueued = 0
  const BATCH_SIZE = 500

  // 循环处理，避免 take 限制导致遗漏
  while (true) {
    // 获取一批未关联文章的 CrawlUrl
    const urlsToProcess = await prisma.crawlUrl.findMany({
      where: {
        sourceId,
        status: 'completed',
        articleId: null
      },
      take: BATCH_SIZE
    })

    if (urlsToProcess.length === 0) {
      break
    }

    console.log(`[SiteCrawl] ${sourceId}: 处理 ${urlsToProcess.length} 个 URL`)

    // 批量查询已存在的文章（包含 contentStatus）
    const existingArticles = await prisma.article.findMany({
      where: {
        sourceId,
        externalId: { in: urlsToProcess.map(u => u.normalizedUrl) }
      },
      select: { id: true, externalId: true, contentStatus: true }
    })
    const existingMap = new Map(existingArticles.map(a => [a.externalId, a]))

    // 分离需要创建的和已存在的
    const toCreate: { sourceId: string; externalId: string; title: string; url: string; contentStatus: string }[] = []
    const crawlUrlUpdates: { crawlUrlId: string; articleId: string }[] = []
    // 只收集需要抓取的文章 ID（新创建的 + 已存在但 pending 的）
    const articleIdsToFetch: Set<string> = new Set()

    for (const crawlUrl of urlsToProcess) {
      const existing = existingMap.get(crawlUrl.normalizedUrl)
      if (existing) {
        // 文章已存在，关联 CrawlUrl
        crawlUrlUpdates.push({ crawlUrlId: crawlUrl.id, articleId: existing.id })
        // 只有 contentStatus 为 pending 的才需要重新入队
        if (existing.contentStatus === 'pending') {
          articleIdsToFetch.add(existing.id)
        }
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
        select: { id: true, externalId: true }
      })

      // 建立 externalId -> article 映射
      const newArticleMap = new Map(newArticles.map(a => [a.externalId, a]))

      // 更新 crawlUrl 关联，并收集需要抓取的文章
      for (const crawlUrl of urlsToProcess) {
        const article = newArticleMap.get(crawlUrl.normalizedUrl)
        if (article) {
          crawlUrlUpdates.push({ crawlUrlId: crawlUrl.id, articleId: article.id })
          articleIdsToFetch.add(article.id)
        }
      }
    }

    // 批量更新 CrawlUrl 关联文章 ID
    if (crawlUrlUpdates.length > 0) {
      await prisma.$transaction(
        crawlUrlUpdates.map(({ crawlUrlId, articleId }) =>
          prisma.crawlUrl.update({
            where: { id: crawlUrlId },
            data: { articleId }
          })
        )
      )
    }

    // 构建抓取任务：只抓取需要抓取的文章
    if (articleIdsToFetch.size > 0) {
      // 查询需要抓取的文章详情
      const articlesToFetch = await prisma.article.findMany({
        where: {
          id: { in: Array.from(articleIdsToFetch) }
        },
        select: { id: true, url: true }
      })

      const jobs = articlesToFetch
        .filter(a => a.url)  // 确保有 URL
        .map(a => ({
          articleId: a.id,
          url: a.url!,
          sourceId,
          strategy
        }))

      if (jobs.length > 0) {
        await addFetchJobs(jobs)
        totalQueued += jobs.length
      }
    }

    // 发布进度
    await publishJobStatus({
      jobId,
      sourceId,
      type: 'crawl_discovery',
      status: 'progress',
      progress: {
        current: totalQueued,
        total: urlsToProcess.length,
        queued: totalQueued
      },
      timestamp: Date.now()
    })

    // 如果本批次不足 BATCH_SIZE，说明没有更多了
    if (urlsToProcess.length < BATCH_SIZE) {
      break
    }
  }

  console.log(`[SiteCrawl] ${sourceId}: 共入队 ${totalQueued} 个抓取任务`)
  return totalQueued
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
