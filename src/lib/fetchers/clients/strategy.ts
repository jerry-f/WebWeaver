/**
 * 抓取策略选择器
 *
 * 根据 URL 和域名规则决定使用哪种抓取策略：
 * - fetch: 标准 HTTP 抓取（最快）
 * - browserless: 需要 JS 渲染的 SPA 页面
 */

/**
 * 抓取策略类型
 */
export type FetchStrategy = 'fetch' | 'browserless'

/**
 * 域名规则配置
 */
export interface DomainRule {
  /** 域名匹配模式（支持通配符） */
  pattern: string
  /** 使用的策略 */
  strategy: FetchStrategy
  /** 是否需要滚动加载 */
  needsScroll?: boolean
  /** 自定义请求头 */
  headers?: Record<string, string>
  /** 备注 */
  note?: string
}

/**
 * 已知需要 JS 渲染的网站
 * 这些网站的主要内容通过 JavaScript 动态加载
 */
const KNOWN_SPA_DOMAINS: DomainRule[] = [
  // 社交媒体
  { pattern: '*.twitter.com', strategy: 'browserless', note: 'Twitter/X SPA' },
  { pattern: '*.x.com', strategy: 'browserless', note: 'Twitter/X SPA' },
  { pattern: '*.facebook.com', strategy: 'browserless', note: 'Facebook SPA' },
  { pattern: '*.instagram.com', strategy: 'browserless', note: 'Instagram SPA' },
  { pattern: '*.linkedin.com', strategy: 'browserless', note: 'LinkedIn SPA' },

  // 技术社区
  { pattern: '*.medium.com', strategy: 'browserless', note: 'Medium lazy loading' },
  { pattern: 'medium.com', strategy: 'browserless', note: 'Medium lazy loading' },
  { pattern: '*.substack.com', strategy: 'fetch', note: 'Substack 通常有 RSS 全文' },
  { pattern: '*.dev.to', strategy: 'fetch', note: 'Dev.to 静态渲染' },

  // 新闻网站
  { pattern: '*.bloomberg.com', strategy: 'browserless', note: 'Bloomberg paywall + SPA' },
  { pattern: '*.wsj.com', strategy: 'browserless', note: 'WSJ paywall' },
  { pattern: '*.nytimes.com', strategy: 'browserless', note: 'NYTimes paywall' },

  // 中文网站
  { pattern: '*.weixin.qq.com', strategy: 'browserless', note: '微信公众号' },
  { pattern: 'mp.weixin.qq.com', strategy: 'browserless', note: '微信公众号' },
  { pattern: '*.zhihu.com', strategy: 'browserless', note: '知乎 SPA' },
  { pattern: '*.bilibili.com', strategy: 'browserless', note: 'B站 SPA' },
  { pattern: '*.douban.com', strategy: 'fetch', note: '豆瓣静态渲染' },
  { pattern: '*.juejin.cn', strategy: 'browserless', note: '掘金 SPA' },
  { pattern: '*.segmentfault.com', strategy: 'fetch', note: 'SegmentFault 静态渲染' },

  // 电商
  { pattern: '*.taobao.com', strategy: 'browserless', note: '淘宝 SPA' },
  { pattern: '*.jd.com', strategy: 'browserless', note: '京东 SPA' },
  { pattern: '*.amazon.com', strategy: 'browserless', note: 'Amazon 动态加载' },

  // 无限滚动
  { pattern: '*.pinterest.com', strategy: 'browserless', needsScroll: true, note: 'Pinterest 瀑布流' },
  { pattern: '*.tumblr.com', strategy: 'browserless', needsScroll: true, note: 'Tumblr 无限滚动' },
]

/**
 * SPA 框架特征
 * 页面 HTML 中包含这些特征时，说明需要 JS 渲染
 */
const SPA_INDICATORS = [
  // React
  '<div id="root"></div>',
  '<div id="root">',
  '<div id="app"></div>',
  '<div id="app">',
  // Next.js
  '<div id="__next"></div>',
  '<div id="__next">',
  // Vue
  '<div id="app" data-v-app>',
  // Angular
  '<app-root>',
  // 通用
  'window.__INITIAL_STATE__',
  'window.__NUXT__',
  'window.__NEXT_DATA__',
]

/**
 * 内容质量阈值
 * 低于此字符数认为抓取失败，需要回退到 Browserless
 */
const MIN_CONTENT_LENGTH = 200

/**
 * 匹配域名规则
 *
 * @param url - 目标 URL
 * @returns 匹配的规则或 null
 */
export function matchDomainRule(url: string): DomainRule | null {
  try {
    const { hostname } = new URL(url)

    for (const rule of KNOWN_SPA_DOMAINS) {
      const pattern = rule.pattern

      // 精确匹配
      if (pattern === hostname) {
        return rule
      }

      // 通配符匹配 (*.example.com)
      if (pattern.startsWith('*.')) {
        const baseDomain = pattern.slice(2)
        if (hostname === baseDomain || hostname.endsWith('.' + baseDomain)) {
          return rule
        }
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * 判断 URL 是否需要 Browserless 渲染
 *
 * @param url - 目标 URL
 * @returns 是否需要 Browserless
 */
export function needsBrowserless(url: string): boolean {
  const rule = matchDomainRule(url)
  return rule?.strategy === 'browserless'
}

/**
 * 判断 URL 是否需要滚动加载
 *
 * @param url - 目标 URL
 * @returns 是否需要滚动
 */
export function needsScroll(url: string): boolean {
  const rule = matchDomainRule(url)
  return rule?.needsScroll === true
}

/**
 * 获取推荐的抓取策略
 *
 * @param url - 目标 URL
 * @returns 推荐策略
 */
export function getRecommendedStrategy(url: string): FetchStrategy {
  const rule = matchDomainRule(url)
  return rule?.strategy || 'fetch'
}

/**
 * 检测 HTML 是否为 SPA 空壳
 *
 * @param html - HTML 内容
 * @returns 是否为 SPA
 */
export function isSpaShell(html: string): boolean {
  return SPA_INDICATORS.some(indicator => html.includes(indicator))
}

/**
 * 检测内容质量是否足够
 *
 * @param textContent - 纯文本内容
 * @returns 是否质量足够
 */
export function hasEnoughContent(textContent: string): boolean {
  const trimmed = textContent.trim()
  return trimmed.length >= MIN_CONTENT_LENGTH
}

/**
 * 判断是否需要回退到 Browserless
 *
 * 当标准抓取结果质量不足时调用
 *
 * @param html - 原始 HTML
 * @param textContent - 提取的纯文本
 * @param title - 提取的标题
 * @returns 是否需要回退
 */
export function shouldFallbackToBrowserless(
  html: string,
  textContent: string,
  title?: string
): boolean {
  // 1. SPA 空壳检测
  if (isSpaShell(html)) {
    return true
  }

  // 2. 内容长度检测
  if (!hasEnoughContent(textContent)) {
    return true
  }

  // 3. 标题缺失检测
  if (!title || title === 'Untitled' || title.length < 3) {
    return true
  }

  return false
}

/**
 * 获取域名的自定义请求头
 *
 * @param url - 目标 URL
 * @returns 请求头或空对象
 */
export function getDomainHeaders(url: string): Record<string, string> {
  const rule = matchDomainRule(url)
  return rule?.headers || {}
}

/**
 * 添加自定义域名规则
 *
 * @param rules - 规则列表
 */
export function addDomainRules(rules: DomainRule[]): void {
  KNOWN_SPA_DOMAINS.push(...rules)
}

/**
 * 获取所有域名规则（用于调试）
 */
export function getAllDomainRules(): DomainRule[] {
  return [...KNOWN_SPA_DOMAINS]
}
