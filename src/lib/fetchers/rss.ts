import Parser from 'rss-parser'
import { fetchRaw } from './unified-fetcher'

/**
 * RSS 解析器实例
 *
 * 使用 rss-parser 库解析 RSS/Atom 订阅源
 * 注意：不再使用 parser.parseURL()，而是先用 Go Scraper 获取原始 XML
 */
const parser = new Parser()

/**
 * 抓取到的文章数据结构
 *
 * 这是从各种来源（RSS/Scrape）抓取后的统一数据格式
 */
export interface FetchedArticle {
  externalId: string      // 外部唯一标识，用于去重（通常是 guid 或 URL）
  title: string           // 文章标题
  content?: string        // 文章内容/摘要
  url: string             // 文章原始链接
  imageUrl?: string       // 封面图 URL
  author?: string         // 作者
  publishedAt?: Date      // 发布时间
}

/**
 * RSS 抓取选项
 */
export interface RSSFetchOptions {
  /** 自定义请求头（包括 Cookie） */
  headers?: Record<string, string>
  /** 超时时间（毫秒） */
  timeout?: number
  /** 是否跳过凭证自动注入 */
  skipCredentials?: boolean
}

/**
 * 抓取 RSS/Atom 订阅源
 *
 * 改进：使用 Go Scraper 获取原始 XML（带 TLS 指纹伪造），然后本地解析
 * 这样可以绕过某些网站的反爬虫检测
 *
 * 支持的格式：RSS 0.9x, RSS 1.0, RSS 2.0, Atom 0.3, Atom 1.0
 *
 * @param url - RSS 订阅源的 URL 地址
 * @param options - 抓取选项（headers、timeout 等）
 * @returns 返回解析后的文章数组
 *
 * @example
 * // 基本用法
 * const articles = await fetchRSS('https://example.com/feed.xml')
 *
 * // 带自定义 Cookie
 * const articles = await fetchRSS('https://example.com/feed.xml', {
 *   headers: { 'Cookie': 'session=xxx' }
 * })
 */
export async function fetchRSS(url: string, options: RSSFetchOptions = {}): Promise<FetchedArticle[]> {
  // 第一步：使用统一抓取服务获取原始 XML
  // 这会自动：1) 使用 Go Scraper 的 TLS 指纹伪造 2) 注入站点凭证（如果有）
  const rawResult = await fetchRaw(url, {
    timeout: options.timeout || 15000,
    skipCredentials: options.skipCredentials
  })

  if (!rawResult.success || !rawResult.body) {
    throw new Error(`Failed to fetch RSS: ${rawResult.error || 'Empty response'}`)
  }

  // 第二步：使用 rss-parser 解析 XML 字符串
  const feed = await parser.parseString(rawResult.body)

  // 第三步：将每个 RSS item 转换为统一的 FetchedArticle 格式
  return feed.items.map(item => ({
    // externalId 优先级：guid > link > title
    // guid 是 RSS 规范中用于唯一标识文章的字段
    externalId: item.guid || item.link || item.title || '',

    // 标题，如果为空则显示 'Untitled'
    title: item.title || 'Untitled',

    // 内容优先级：content（HTML） > summary > contentSnippet（纯文本摘要）
    // 关键改进：优先使用 HTML 格式的 content，保留排版和图片
    // contentSnippet 是 rss-parser 自动去除 HTML 标签后的纯文本，作为最后备选
    content: item.content || item.summary || item.contentSnippet,

    // 文章链接
    url: item.link || '',

    // 封面图，通过 extractImage 函数从多个来源提取
    imageUrl: extractImage(item),

    // 作者，优先使用 dc:creator（Dublin Core），其次使用 author
    author: item.creator || item.author,

    // 发布时间，将字符串解析为 Date 对象
    publishedAt: item.pubDate ? new Date(item.pubDate) : undefined
  }))
}

/**
 * 从 RSS item 中提取封面图 URL
 *
 * 按优先级从多个来源尝试提取图片：
 * 1. enclosure 标签（RSS 2.0 附件，常用于播客封面）
 * 2. media:content 标签（Media RSS 扩展，常见于新闻源）
 * 3. content 中的 <img> 标签（从 HTML 内容中提取第一张图）
 *
 * @param item - rss-parser 解析后的文章条目
 * @returns 图片 URL，如果未找到则返回 undefined
 */
function extractImage(item: Parser.Item): string | undefined {
  // 方式1：检查 enclosure 标签
  // RSS 2.0 的 enclosure 用于附件（如音频、图片）
  // 只提取 type 为 image/* 的附件
  if (item.enclosure?.url && item.enclosure.type?.startsWith('image')) {
    return item.enclosure.url
  }

  // 方式2：检查 media:content 标签
  // Media RSS 是 Yahoo 提出的扩展规范，被很多新闻网站采用
  // 例如：<media:content url="https://..." medium="image" />
  const media = (item as Record<string, unknown>)['media:content']
  if (media && typeof media === 'object' && 'url' in media) {
    return media.url as string
  }

  // 方式3：从 HTML content 中提取第一个 <img> 标签的 src
  // 使用正则表达式匹配，适用于没有专门图片字段的 RSS 源
  if (item.content) {
    const match = item.content.match(/<img[^>]+src="([^"]+)"/)
    if (match) return match[1]
  }

  // 未找到任何图片
  return undefined
}
