import { JSDOM } from 'jsdom'
import { FetchedArticle, ScrapeConfig } from './types'

export async function fetchScrape(url: string, config: ScrapeConfig): Promise<FetchedArticle[]> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  const html = await response.text()
  const dom = new JSDOM(html, { url })
  const document = dom.window.document

  const items = document.querySelectorAll(config.listSelector)
  const articles: FetchedArticle[] = []

  items.forEach((item, index) => {
    try {
      const titleEl = item.querySelector(config.titleSelector)
      const linkEl = item.querySelector(config.linkSelector) as HTMLAnchorElement | null

      if (!titleEl || !linkEl) {
        return
      }

      const title = titleEl.textContent?.trim() || ''
      const articleUrl = linkEl.href || ''

      if (!title || !articleUrl) {
        return
      }

      const article: FetchedArticle = {
        externalId: articleUrl || `scrape-${index}`,
        title,
        url: articleUrl,
      }

      if (config.imageSelector) {
        const imgEl = item.querySelector(config.imageSelector) as HTMLImageElement | null
        if (imgEl?.src) {
          article.imageUrl = imgEl.src
        }
      }

      if (config.authorSelector) {
        const authorEl = item.querySelector(config.authorSelector)
        if (authorEl?.textContent) {
          article.author = authorEl.textContent.trim()
        }
      }

      if (config.dateSelector) {
        const dateEl = item.querySelector(config.dateSelector)
        if (dateEl?.textContent) {
          const parsed = new Date(dateEl.textContent.trim())
          if (!isNaN(parsed.getTime())) {
            article.publishedAt = parsed
          }
        }
      }

      articles.push(article)
    } catch (e) {
      console.error('Failed to parse scrape item:', e)
    }
  })

  return articles
}
