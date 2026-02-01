import { JSDOM } from 'jsdom'
import { FetchedArticle, ScrapeConfig } from './types'

/**
 * 使用 CSS 选择器抓取网页文章列表
 *
 * 适用于没有 RSS 订阅源的网站，通过配置 CSS 选择器从 HTML 页面中提取文章列表
 * 使用 jsdom 库在 Node.js 环境中模拟浏览器 DOM 操作
 *
 * @param url - 要抓取的网页 URL（通常是文章列表页）
 * @param config - 抓取配置，包含各字段的 CSS 选择器
 * @returns 返回解析后的文章数组
 *
 * @example
 * const articles = await fetchScrape('https://example.com/news', {
 *   listSelector: '.article-item',      // 文章列表容器选择器
 *   titleSelector: '.title',            // 标题选择器
 *   linkSelector: 'a.read-more',        // 链接选择器
 *   imageSelector: 'img.cover',         // 封面图选择器（可选）
 *   authorSelector: '.author-name',     // 作者选择器（可选）
 *   dateSelector: '.publish-date'       // 日期选择器（可选）
 * })
 */
export async function fetchScrape(url: string, config: ScrapeConfig): Promise<FetchedArticle[]> {
  // ========== 第一步：获取网页 HTML ==========
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  // ========== 第二步：解析 HTML 为 DOM ==========
  // 使用 jsdom 创建虚拟 DOM 环境
  // 传入 url 参数使相对链接能够正确解析为绝对 URL
  const html = await response.text()
  const dom = new JSDOM(html, { url })
  const document = dom.window.document

  // ========== 第三步：查找所有文章条目 ==========
  // listSelector 应该匹配页面中每个文章卡片/条目的容器元素
  // 例如：'.post-item', 'article', '.news-card' 等
  const items = document.querySelectorAll(config.listSelector)
  const articles: FetchedArticle[] = []

  // ========== 第四步：遍历并提取每篇文章的数据 ==========
  items.forEach((item, index) => {
    try {
      // ---------- 4.1 提取必填字段：标题和链接 ----------
      const titleEl = item.querySelector(config.titleSelector)
      const linkEl = item.querySelector(config.linkSelector) as HTMLAnchorElement | null

      // 如果标题或链接元素不存在，跳过此条目
      if (!titleEl || !linkEl) {
        return
      }

      const title = titleEl.textContent?.trim() || ''
      // href 属性会被 jsdom 自动转换为绝对 URL（因为我们传入了 url 参数）
      const articleUrl = linkEl.href || ''

      // 标题和链接都是必填项，缺少则跳过
      if (!title || !articleUrl) {
        return
      }

      // 创建基础文章对象
      // externalId 使用 URL 作为唯一标识，如果 URL 为空则使用索引
      const article: FetchedArticle = {
        externalId: articleUrl || `scrape-${index}`,
        title,
        url: articleUrl,
      }

      // ---------- 4.2 提取可选字段：封面图 ----------
      if (config.imageSelector) {
        const imgEl = item.querySelector(config.imageSelector) as HTMLImageElement | null
        if (imgEl?.src) {
          article.imageUrl = imgEl.src
        }
      }

      // ---------- 4.3 提取可选字段：作者 ----------
      if (config.authorSelector) {
        const authorEl = item.querySelector(config.authorSelector)
        if (authorEl?.textContent) {
          article.author = authorEl.textContent.trim()
        }
      }

      // ---------- 4.4 提取可选字段：发布日期 ----------
      if (config.dateSelector) {
        const dateEl = item.querySelector(config.dateSelector)
        if (dateEl?.textContent) {
          // 尝试将文本解析为日期
          // 注意：这里依赖 JavaScript 的 Date 解析，可能不支持所有日期格式
          const parsed = new Date(dateEl.textContent.trim())
          // 检查日期是否有效（无效日期的 getTime() 返回 NaN）
          if (!isNaN(parsed.getTime())) {
            article.publishedAt = parsed
          }
        }
      }

      // 将解析成功的文章加入结果数组
      articles.push(article)
    } catch (e) {
      // 单个条目解析失败不影响其他条目，记录错误并继续
      console.error('Failed to parse scrape item:', e)
    }
  })

  return articles
}
