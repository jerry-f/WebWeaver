import Parser from 'rss-parser'

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'NewsFlow/1.0'
  }
})

export interface FetchedArticle {
  externalId: string
  title: string
  content?: string
  url: string
  imageUrl?: string
  author?: string
  publishedAt?: Date
}

export async function fetchRSS(url: string): Promise<FetchedArticle[]> {
  const feed = await parser.parseURL(url)
  
  return feed.items.map(item => ({
    externalId: item.guid || item.link || item.title || '',
    title: item.title || 'Untitled',
    content: item.contentSnippet || item.content || item.summary,
    url: item.link || '',
    imageUrl: extractImage(item),
    author: item.creator || item.author,
    publishedAt: item.pubDate ? new Date(item.pubDate) : undefined
  }))
}

function extractImage(item: Parser.Item): string | undefined {
  // Check enclosure
  if (item.enclosure?.url && item.enclosure.type?.startsWith('image')) {
    return item.enclosure.url
  }
  // Check media:content (common in RSS)
  const media = (item as Record<string, unknown>)['media:content']
  if (media && typeof media === 'object' && 'url' in media) {
    return media.url as string
  }
  // Extract from content
  if (item.content) {
    const match = item.content.match(/<img[^>]+src="([^"]+)"/)
    if (match) return match[1]
  }
  return undefined
}
