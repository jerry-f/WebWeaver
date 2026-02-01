import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

export async function fetchFullText(url: string): Promise<{ content: string; title?: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsFlow/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(15000)
    })
    
    if (!res.ok) return null
    
    const html = await res.text()
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    
    if (!article || !article.textContent) return null
    
    return {
      content: article.textContent.trim(),
      title: article.title || undefined
    }
  } catch (e) {
    console.error('Failed to fetch full text:', url, e)
    return null
  }
}
