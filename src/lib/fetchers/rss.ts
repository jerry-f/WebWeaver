import Parser from 'rss-parser'

/**
 * RSS 解析器实例
 *
 * 使用 rss-parser 库解析 RSS/Atom 订阅源
 * 配置说明：
 * - timeout: 请求超时时间（10秒）
 * - User-Agent: 自定义请求头，避免被某些网站拦截
 */
const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'NewsFlow/1.0'
  }
})

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
 * 抓取 RSS/Atom 订阅源
 *
 * 解析给定 URL 的 RSS 或 Atom 源，提取所有文章条目
 * 支持的格式：RSS 0.9x, RSS 1.0, RSS 2.0, Atom 0.3, Atom 1.0
 *
 * @param url - RSS 订阅源的 URL 地址
 * @returns 返回解析后的文章数组
 *
 * @example
 * const articles = await fetchRSS('https://example.com/feed.xml')
 */
export async function fetchRSS(url: string): Promise<FetchedArticle[]> {
  // 解析 RSS 源，返回包含 feed 元信息和 items 数组的对象
  const feed = await parser.parseURL(url)

  // 将每个 RSS item 转换为统一的 FetchedArticle 格式
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
