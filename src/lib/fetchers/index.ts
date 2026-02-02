import { prisma } from '../prisma'
import { fetchRSS } from './rss'
import { fetchScrape } from './scrape'
import { FetchedArticle, SourceConfig, SourceFetchConfig } from './types'
import { calculateReadingTime } from '../utils/reading-time'
import { queueArticleForSummary } from '../ai/queue'
import { getUnifiedFetcher } from './unified-fetcher'
import { CredentialManager } from '../auth/credential-manager'
import { addFetchJobs } from '../queue/queues'

// 凭证管理器单例
const credentialManager = new CredentialManager()

/**
 * 抓取单个信息源的文章
 *
 * 这是文章抓取的核心函数，负责：
 * 1. 根据信息源类型（RSS/Scrape）获取文章列表（使用 Go Scraper + 凭证注入）
 * 2. 将文章存入数据库（自动去重，contentStatus: 'pending'）
 * 3. 如果需要全文抓取，将任务推送到 BullMQ 队列
 * 4. Worker 异步处理全文抓取（带域名限速）
 *
 * @param sourceId - 信息源的唯一标识符
 * @param options - 抓取选项
 * @returns 返回新增文章数量、队列任务数和错误信息列表
 */
export async function fetchSource(
  sourceId: string,
  options: { useQueue?: boolean } = {}
): Promise<{ added: number; queued: number; errors: string[] }> {
  // 默认使用队列模式，可通过环境变量或参数控制
  const useQueue = options.useQueue ?? (process.env.USE_QUEUE_FETCH !== 'false')

  // ========== 第一步：获取信息源配置 ==========
  const source = await prisma.source.findUnique({ where: { id: sourceId } })
  if (!source) throw new Error('Source not found')

  // 存储抓取到的文章列表
  let articles: FetchedArticle[] = []
  // 存储抓取过程中的错误信息
  const errors: string[] = []

  // ========== 第二步：解析配置 ==========
  const config: SourceConfig = source.config ? JSON.parse(source.config) : {}
  const fetchConfig: SourceFetchConfig = config.fetch || {}

  // ========== 第三步：根据类型抓取文章列表 ==========
  try {
    const fetchOptions = {
      timeout: fetchConfig.timeout || 30000,
      skipCredentials: false
    }

    switch (source.type.toLowerCase()) {
      case 'rss':
        articles = await fetchRSS(source.url, fetchOptions)
        break

      case 'scrape':
        if (!config.scrape) {
          throw new Error('Scrape config is required for scrape type sources')
        }
        articles = await fetchScrape(source.url, config.scrape, fetchOptions)
        break

      default:
        throw new Error(`Unknown source type: ${source.type}`)
    }

    console.log(`[fetchSource] ${source.name}: 获取到 ${articles.length} 篇文章`)
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
    console.error(`[fetchSource] ${source.name}: 抓取列表失败:`, e)
    return { added: 0, queued: 0, errors }
  }

  // ========== 第四步：批量入库 ==========
  const shouldFetchFullText = source.fetchFullText || fetchConfig.fetchFullText
  const newArticles: { id: string; url: string }[] = []
  let added = 0

  for (const article of articles) {
    try {
      // 计算阅读时间（基于 RSS 摘要）
      let readingTime: number | undefined
      if (article.content) {
        readingTime = calculateReadingTime(article.content)
      }

      // 入库时 contentStatus 设为 pending（如果需要全文抓取）
      const contentStatus = shouldFetchFullText ? 'pending' : (article.content ? 'completed' : 'pending')

      const result = await prisma.article.upsert({
        where: {
          sourceId_externalId: {
            sourceId: source.id,
            externalId: article.externalId
          }
        },
        create: {
          sourceId: source.id,
          externalId: article.externalId,
          title: article.title,
          content: article.content,
          url: article.url,
          imageUrl: article.imageUrl,
          author: article.author,
          publishedAt: article.publishedAt,
          readingTime,
          category: source?.category || null,
          summaryStatus: 'pending',
          contentStatus
        },
        update: {}
      })

      // 记录新增的文章（用于后续推送队列）
      if (result && article.url) {
        newArticles.push({ id: result.id, url: article.url })
      }

      added++
    } catch {
      // 通常是唯一约束冲突（文章已存在），静默跳过
    }
  }

  // ========== 第五步：推送到队列或同步抓取 ==========
  let queued = 0

  if (shouldFetchFullText && newArticles.length > 0) {
    if (useQueue) {
      // 队列模式：批量推送到 BullMQ，由 FetchWorker 异步处理
      try {
        await addFetchJobs(newArticles.map(a => ({
          articleId: a.id,
          url: a.url,
          sourceId: source.id
        })))
        queued = newArticles.length
        console.log(`[fetchSource] ${source.name}: 推送 ${queued} 个全文抓取任务到队列`)
      } catch (queueError) {
        console.error(`[fetchSource] ${source.name}: 推送队列失败:`, queueError)
        errors.push(`推送队列失败: ${queueError instanceof Error ? queueError.message : String(queueError)}`)
      }
    } else {
      // 同步模式：直接抓取（回退方案）
      console.log(`[fetchSource] ${source.name}: 使用同步模式抓取全文`)
      const fetcher = getUnifiedFetcher()

      for (const article of newArticles) {
        try {
          const result = await fetcher.fetch(article.url, {
            sourceId: source.id,
            timeout: fetchConfig.timeout || 30000,
            strategy: fetchConfig.strategy || 'auto'
          })

          if (result.success && result.content) {
            await prisma.article.update({
              where: { id: article.id },
              data: {
                content: result.content,
                textContent: result.textContent,
                contentStatus: 'completed',
                fetchStrategy: result.strategy
              }
            })

            // 加入 AI 摘要队列
            queueArticleForSummary(article.id)
          }
        } catch (fetchError) {
          console.warn(`[fetchSource] 全文抓取失败: ${article.url}`, fetchError)
        }
      }
    }
  }

  console.log(`[fetchSource] ${source.name}: 新增 ${added} 篇文章, 队列 ${queued} 个任务`)
  return { added, queued, errors }
}

/**
 * 抓取所有已启用的信息源
 *
 * 遍历数据库中所有 enabled=true 的信息源，依次调用 fetchSource 进行抓取
 * 适用于定时任务批量更新所有订阅源
 *
 * @returns 返回每个信息源的抓取结果数组
 */
export async function fetchAllSources(): Promise<{ sourceId: string; sourceName: string; added: number; queued: number; errors: string[] }[]> {
  const sources = await prisma.source.findMany({ where: { enabled: true } })
  const results = []

  console.log(`[fetchAllSources] 开始抓取 ${sources.length} 个信息源`)

  for (const source of sources) {
    try {
      const result = await fetchSource(source.id)
      results.push({ sourceId: source.id, sourceName: source.name, ...result })
    } catch (error) {
      console.error(`[fetchAllSources] ${source.name} 抓取失败:`, error)
      results.push({
        sourceId: source.id,
        sourceName: source.name,
        added: 0,
        queued: 0,
        errors: [error instanceof Error ? error.message : String(error)]
      })
    }
  }

  const totalAdded = results.reduce((sum, r) => sum + r.added, 0)
  const totalQueued = results.reduce((sum, r) => sum + r.queued, 0)
  console.log(`[fetchAllSources] 完成，共新增 ${totalAdded} 篇文章, 队列 ${totalQueued} 个任务`)

  return results
}

/**
 * 检查凭证状态
 *
 * @returns 凭证状态报告
 */
export function getCredentialStatus(): { domain: string; enabled: boolean; hasCredential: boolean }[] {
  const allCredentials = credentialManager.getAllCredentials()
  return allCredentials.map(cred => ({
    domain: cred.domain,
    enabled: cred.enabled,
    hasCredential: cred.cookieLength > 0
  }))
}

/**
 * 重新加载凭证配置
 */
export function reloadCredentials(): void {
  credentialManager.reload()
  getUnifiedFetcher().reloadCredentials()
}
