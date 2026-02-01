import { prisma } from '../prisma'
import { fetchRSS, FetchedArticle } from './rss'

export async function fetchSource(sourceId: string): Promise<{ added: number; errors: string[] }> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } })
  if (!source) throw new Error('Source not found')
  
  let articles: FetchedArticle[] = []
  const errors: string[] = []
  
  try {
    switch (source.type.toLowerCase()) {
      case 'rss':
        articles = await fetchRSS(source.url)
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
      await prisma.article.upsert({
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
          publishedAt: article.publishedAt
        },
        update: {} // Don't update existing
      })
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
