import { prisma } from '../prisma'
import { fetchRSS } from './rss'
import { fetchScrape } from './scrape'
import { FetchedArticle, SourceConfig, SourceFetchConfig } from './types'
import { calculateReadingTime } from '../utils/reading-time'
import { queueArticleForSummary } from '../ai/queue'
import { getUnifiedFetcher } from './unified-fetcher'
import { CredentialManager } from '../auth/credential-manager'

// 凭证管理器单例
const credentialManager = new CredentialManager()

/**
 * 抓取单个信息源的文章
 *
 * 这是文章抓取的核心函数，负责：
 * 1. 根据信息源类型（RSS/Scrape）获取文章列表（使用 Go Scraper + 凭证注入）
 * 2. 可选地抓取文章全文内容（使用统一抓取服务，自动注入凭证）
 * 3. 计算阅读时间
 * 4. 将文章存入数据库（自动去重）
 * 5. 将新文章加入 AI 摘要生成队列
 *
 * @param sourceId - 信息源的唯一标识符
 * @returns 返回新增文章数量和错误信息列表
 */
export async function fetchSource(sourceId: string): Promise<{ added: number; errors: string[] }> {
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
  // 现在 RSS 和 Scrape 都会自动使用 Go Scraper + 凭证注入
  try {
    const fetchOptions = {
      timeout: fetchConfig.timeout || 30000,
      skipCredentials: false  // 自动注入凭证
    }

    switch (source.type.toLowerCase()) {
      case 'rss':
        // RSS 类型：Go Scraper 获取 XML → rss-parser 解析
        // 自动注入站点凭证（如果配置了）
        articles = await fetchRSS(source.url, fetchOptions)
        break

      case 'scrape':
        // Scrape 类型：Go Scraper 获取 HTML → jsdom 解析选择器
        // 自动注入站点凭证（如果配置了）
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
    return { added: 0, errors }
  }

  // ========== 第四步：处理每篇文章并存入数据库 ==========
  let added = 0
  const fetcher = getUnifiedFetcher()

  // 检查是否需要全文抓取
  const shouldFetchFullText = source.fetchFullText || fetchConfig.fetchFullText

  for (const article of articles) {
    try {
      let content = article.content
      let textContent: string | undefined
      let readingTime: number | undefined
      let fetchStrategy: string | undefined

      // ---------- 4.1 全文抓取（可选） ----------
      if (shouldFetchFullText && article.url) {
        try {
          const result = await fetcher.fetch(article.url, {
            sourceId: source.id,
            timeout: fetchConfig.timeout || 30000
          })
          
          if (result.success && result.content) {
            content = result.content
            textContent = result.textContent
            fetchStrategy = result.strategy
            
            if (result.credentialExpired) {
              errors.push(`凭证已过期: ${article.url}`)
            }
          }
        } catch (fetchError) {
          // 全文抓取失败不影响文章入库，记录警告
          console.warn(`[fetchSource] 全文抓取失败: ${article.url}`, fetchError)
        }
      }

      // ---------- 4.2 计算阅读时间 ----------
      const textForReading = textContent || content
      if (textForReading) {
        readingTime = calculateReadingTime(textForReading)
      }

      // ---------- 4.3 存入数据库（Upsert 去重） ----------
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
          content,
          textContent,
          url: article.url,
          imageUrl: article.imageUrl,
          author: article.author,
          publishedAt: article.publishedAt,
          readingTime,
          category: source?.category || null,
          summaryStatus: 'pending',
          contentStatus: content ? 'completed' : 'pending',
          fetchStrategy
        },
        update: {}
      })

      // ---------- 4.4 加入 AI 摘要队列 ----------
      if (result) {
        queueArticleForSummary(result.id)
      }

      added++
    } catch {
      // 通常是唯一约束冲突（文章已存在），静默跳过
    }
  }

  console.log(`[fetchSource] ${source.name}: 新增 ${added} 篇文章`)
  return { added, errors }
}

/**
 * 抓取所有已启用的信息源
 *
 * 遍历数据库中所有 enabled=true 的信息源，依次调用 fetchSource 进行抓取
 * 适用于定时任务批量更新所有订阅源
 *
 * @returns 返回每个信息源的抓取结果数组
 */
export async function fetchAllSources(): Promise<{ sourceId: string; sourceName: string; added: number; errors: string[] }[]> {
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
        errors: [error instanceof Error ? error.message : String(error)]
      })
    }
  }

  const totalAdded = results.reduce((sum, r) => sum + r.added, 0)
  console.log(`[fetchAllSources] 完成，共新增 ${totalAdded} 篇文章`)

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
