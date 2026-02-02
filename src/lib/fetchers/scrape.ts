import { JSDOM } from 'jsdom'
import { FetchedArticle, ScrapeConfig } from './types'
import { fetchRaw } from './unified-fetcher'

/**
 * Scrape 抓取选项
 */
export interface ScrapeFetchOptions {
  /** 自定义请求头（包括 Cookie） */
  headers?: Record<string, string>
  /** 超时时间（毫秒） */
  timeout?: number
  /** 是否跳过凭证自动注入 */
  skipCredentials?: boolean
}

/**
 * 使用 CSS 选择器抓取网页文章列表
 *
 * 改进：使用 Go Scraper 获取原始 HTML（带 TLS 指纹伪造），然后本地解析选择器
 * 这样可以绕过某些网站的反爬虫检测，同时支持站点凭证注入
 *
 * @param url - 要抓取的网页 URL（通常是文章列表页）
 * @param config - 抓取配置，包含各字段的 CSS 选择器
 * @param options - 抓取选项（headers、timeout 等）
 * @returns 返回解析后的文章数组
 *
 * @example
 * // 基本用法
 * const articles = await fetchScrape('https://example.com/news', {
 *   listSelector: '.article-item',
 *   titleSelector: '.title',
 *   linkSelector: 'a.read-more',
 *   imageSelector: 'img.cover',
 *   authorSelector: '.author-name',
 *   dateSelector: '.publish-date'
 * })
 *
 * // 带凭证（自动注入）
 * const articles = await fetchScrape('https://zhihu.com/hot', config)
 */
export async function fetchScrape(
  url: string,
  config: ScrapeConfig,
  options: ScrapeFetchOptions = {}
): Promise<FetchedArticle[]> {
  // ========== 第一步：使用统一抓取服务获取原始 HTML ==========
  // 这会自动：1) 使用 Go Scraper 的 TLS 指纹伪造 2) 注入站点凭证（如果有）
  const rawResult = await fetchRaw(url, {
    timeout: options.timeout || 30000,
    skipCredentials: options.skipCredentials
  })

  if (!rawResult.success || !rawResult.body) {
    throw new Error(`Failed to fetch ${url}: ${rawResult.error || 'Empty response'}`)
  }

  // ========== 第二步：解析 HTML 为 DOM ==========
  // 使用 jsdom 创建虚拟 DOM 环境
  // 传入 url 参数使相对链接能够正确解析为绝对 URL
  const dom = new JSDOM(rawResult.body, { url: rawResult.finalUrl || url })
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

      // ---------- 4.2 提取可选字段：内容/摘要 ----------
      if (config.contentSelector) {
        const contentEl = item.querySelector(config.contentSelector)
        if (contentEl?.textContent) {
          article.content = contentEl.textContent.trim()
        }
      }

      // ---------- 4.3 提取可选字段：封面图 ----------
      if (config.imageSelector) {
        const imgEl = item.querySelector(config.imageSelector) as HTMLImageElement | null
        if (imgEl?.src) {
          article.imageUrl = imgEl.src
        }
      }

      // ---------- 4.4 提取可选字段：作者 ----------
      if (config.authorSelector) {
        const authorEl = item.querySelector(config.authorSelector)
        if (authorEl?.textContent) {
          article.author = authorEl.textContent.trim()
        }
      }

      // ---------- 4.5 提取可选字段：发布日期 ----------
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
