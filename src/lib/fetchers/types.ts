/**
 * 抓取策略类型
 * - auto: 自动选择（优先 Go Scraper）
 * - go: 强制使用 Go Scraper
 * - browserless: 强制使用浏览器渲染
 * - local: 强制使用本地抓取
 */
export type FetchStrategy = 'auto' | 'go' | 'browserless' | 'local'

/**
 * 抓取到的文章数据结构
 *
 * 这是从各种来源（RSS/Scrape）抓取后的统一数据格式
 * 不同的抓取器（rss.ts、scrape.ts）都会返回此格式的数据
 */
export interface FetchedArticle {
  /**
   * 外部唯一标识符
   * 用于去重，防止同一篇文章被重复入库
   * 通常来自 RSS 的 guid 字段或文章 URL
   */
  externalId: string

  /**
   * 文章标题
   */
  title: string

  /**
   * 文章内容
   * 可能是 RSS 中的摘要，也可能是全文抓取后的完整内容
   */
  content?: string

  /**
   * 文章摘要
   * 与 content 不同，summary 专门用于存储简短摘要
   */
  summary?: string

  /**
   * 文章原始链接
   * 用户点击后跳转到原文的 URL
   */
  url: string

  /**
   * 封面图 URL
   * 从 RSS enclosure、media:content 或 HTML 中提取
   */
  imageUrl?: string

  /**
   * 作者名称
   */
  author?: string

  /**
   * 发布时间
   */
  publishedAt?: Date
}

/**
 * 抓取结果
 *
 * fetchSource 函数的返回类型，包含抓取到的文章列表和错误信息
 */
export interface FetchResult {
  /**
   * 成功抓取的文章列表
   */
  articles: FetchedArticle[]

  /**
   * 抓取过程中的错误信息
   * 即使部分文章抓取失败，其他成功的文章仍会返回
   */
  errors: string[]
}

/**
 * 网页抓取配置（Scrape 类型专用）
 *
 * 定义用于从 HTML 页面提取文章列表的 CSS 选择器
 * 适用于没有 RSS 订阅源的网站
 *
 * @example
 * {
 *   listSelector: '.article-list .item',  // 每个文章条目的容器
 *   titleSelector: 'h2.title',            // 标题元素
 *   linkSelector: 'a.read-more',          // 链接元素
 *   imageSelector: 'img.cover',           // 封面图元素
 *   authorSelector: '.author-name',       // 作者元素
 *   dateSelector: '.publish-date'         // 日期元素
 * }
 */
export interface ScrapeConfig {
  /**
   * 【必填】文章列表选择器
   * 匹配页面中每个文章条目的容器元素
   * 例如：'.post-item', 'article.news', '.article-list > li'
   */
  listSelector: string

  /**
   * 【必填】标题选择器
   * 在每个列表项内部匹配标题元素
   * 例如：'h2', '.title', 'a.headline'
   */
  titleSelector: string

  /**
   * 【必填】链接选择器
   * 在每个列表项内部匹配包含文章 URL 的 <a> 元素
   * 例如：'a', 'a.read-more', 'h2 a'
   */
  linkSelector: string

  /**
   * 【可选】内容/摘要选择器
   * 在每个列表项内部匹配文章摘要元素
   * 例如：'.excerpt', '.summary', 'p.description'
   */
  contentSelector?: string

  /**
   * 【可选】封面图选择器
   * 在每个列表项内部匹配 <img> 元素
   * 例如：'img', '.thumbnail img', 'figure img'
   */
  imageSelector?: string

  /**
   * 【可选】作者选择器
   * 在每个列表项内部匹配作者名称元素
   * 例如：'.author', '.byline', 'span.writer'
   */
  authorSelector?: string

  /**
   * 【可选】日期选择器
   * 在每个列表项内部匹配发布日期元素
   * 例如：'.date', 'time', '.publish-time'
   */
  dateSelector?: string
}

/**
 * 全站爬取配置（SiteCrawl 类型专用）
 *
 * 用于配置从种子 URL 开始递归爬取整个网站的行为
 *
 * @example
 * {
 *   maxDepth: 3,
 *   maxUrls: 1000,
 *   includePatterns: ['/docs/', '/guide/'],
 *   excludePatterns: ['/api/', '/login'],
 *   sameDomainOnly: true
 * }
 */
export interface SiteCrawlConfig {
  /**
   * 最大爬取深度
   * 0 = 只抓取种子 URL
   * 1 = 种子 URL + 直接链接
   * 默认: 3
   */
  maxDepth?: number

  /**
   * 最大发现 URL 数量
   * 防止无限爬取，默认: 1000
   */
  maxUrls?: number

  /**
   * URL 包含规则（正则表达式数组）
   * 只爬取匹配的 URL
   * 例如: ["/docs/", "/guide/"]
   */
  includePatterns?: string[]

  /**
   * URL 排除规则（正则表达式数组）
   * 跳过匹配的 URL
   * 例如: ["/api/", "/login", "\\?page="]
   */
  excludePatterns?: string[]

  /**
   * 是否限制同域名
   * 默认: true（只爬取与种子 URL 相同域名的页面）
   */
  sameDomainOnly?: boolean

  /**
   * 允许的子域名（当 sameDomainOnly=true 时）
   * 例如: ["docs", "blog"] 表示允许 docs.example.com, blog.example.com
   */
  allowedSubdomains?: string[]

  /**
   * 链接提取选择器（可选）
   * 默认提取所有 <a href="...">
   * 可以限制为特定区域，如 "main a" 或 ".content a"
   */
  linkSelector?: string

  /**
   * 内容区域选择器（可选）
   * 用于只提取特定区域的链接，过滤导航栏等
   */
  contentSelector?: string
}

/**
 * 信息源配置
 *
 * 存储在 Source.config JSON 字段中的扩展配置
 * 不同类型的信息源使用不同的配置项
 */
export interface SourceConfig {
  /**
   * Scrape 类型专用配置
   * 包含用于网页抓取的 CSS 选择器
   */
  scrape?: ScrapeConfig

  /**
   * 全站爬取配置
   * SiteCrawl 类型专用
   */
  siteCrawl?: SiteCrawlConfig

  /**
   * 抓取配置
   * 控制抓取行为的选项
   */
  fetch?: SourceFetchConfig

  /**
   * 其他扩展配置
   * 允许添加未来可能需要的自定义配置项
   */
  [key: string]: unknown
}

/**
 * 信息源抓取配置
 *
 * 控制信息源的抓取行为
 */
export interface SourceFetchConfig {
  /**
   * 抓取策略
   * - auto: 自动选择（优先 Go Scraper）
   * - go: 强制使用 Go Scraper
   * - browserless: 强制使用浏览器渲染
   * - local: 强制使用本地抓取
   */
  strategy?: FetchStrategy

  /**
   * 是否启用全文抓取
   * 如果为 true，会访问每篇文章的原始 URL 获取完整正文
   */
  fetchFullText?: boolean

  /**
   * 超时时间（毫秒）
   * 默认 30000
   */
  timeout?: number

  /**
   * 域名调度规则
   */
  scheduling?: {
    /**
     * 最大并发请求数
     */
    maxConcurrent?: number

    /**
     * 每秒最大请求数
     */
    rateLimit?: number

    /**
     * 请求失败后的重试次数
     */
    retryCount?: number

    /**
     * 请求间隔（毫秒）
     */
    delayMs?: number
  }
}
