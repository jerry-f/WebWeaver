import { prisma } from '../prisma'
import { fetchRSS } from './rss'
import { fetchFullText } from './fulltext'
import { fetchScrape } from './scrape'
import { FetchedArticle, SourceConfig } from './types'
import { calculateReadingTime } from '../utils/reading-time'
import { queueArticleForSummary } from '../ai/queue'

export async function fetchSource(sourceId: string): Promise<{ added: number; errors: string[] }> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } })
  if (!source) throw new Error('Source not found')

  let articles: FetchedArticle[] = []
  const errors: string[] = []

  try {
    const config: SourceConfig = source.config ? JSON.parse(source.config) : {}

    switch (source.type.toLowerCase()) {
      case 'rss':
        articles = await fetchRSS(source.url)
        break
      case 'scrape':
        if (!config.scrape) {
          throw new Error('Scrape config is required for scrape type sources')
        }
        articles = await fetchScrape(source.url, config.scrape)
        break
      default:
        throw new Error(`Unknown source type: ${source.type}`)
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
    return { added: 0, errors }
  }

  let added = 0
  for (const article of articles) {
    try {
      let content = article.content
      let readingTime: number | undefined

      // 如果启用全文抓取，获取完整内容
      if (source.fetchFullText && article.url) {
        const fullText = await fetchFullText(article.url)
        if (fullText?.content) {
          content = fullText.content
        }
      }

      // 计算阅读时间
      if (content) {
        readingTime = calculateReadingTime(content)
      }

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
          url: article.url,
          imageUrl: article.imageUrl,
          author: article.author,
          publishedAt: article.publishedAt,
          readingTime,
          summaryStatus: 'pending'
        },
        update: {} // Don't update existing
      })

      // 将新文章加入 AI 摘要队列
      if (result) {
        queueArticleForSummary(result.id)
      }

      added++
    } catch {
      // Likely duplicate, skip
    }
  }

  return { added, errors }
}

export async function fetchAllSources(): Promise<{ sourceId: string; added: number; errors: string[] }[]> {
  const sources = await prisma.source.findMany({ where: { enabled: true } })
  const results = []

  for (const source of sources) {
    const result = await fetchSource(source.id)
    results.push({ sourceId: source.id, ...result })
  }

  return results
}
