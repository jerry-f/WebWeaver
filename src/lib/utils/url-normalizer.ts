/**
 * URL 标准化工具
 *
 * 用于 URL 去重，处理以下情况：
 * - 移除 fragment (#...)
 * - 排序 query 参数
 * - 统一协议
 * - 移除尾部斜杠
 */

/**
 * 标准化 URL
 *
 * @param urlString - 原始 URL
 * @returns 标准化后的 URL
 *
 * @example
 * normalizeUrl('https://example.com/page#section?b=2&a=1')
 * // => 'https://example.com/page?a=1&b=2'
 */
export function normalizeUrl(urlString: string): string {
  try {
    const url = new URL(urlString)

    // 移除 fragment
    url.hash = ''

    // 排序 query 参数
    const params = new URLSearchParams(url.search)
    const sortedParams = new URLSearchParams([...params.entries()].sort())
    url.search = sortedParams.toString()

    // 移除默认端口
    if (
      (url.protocol === 'http:' && url.port === '80') ||
      (url.protocol === 'https:' && url.port === '443')
    ) {
      url.port = ''
    }

    // 移除尾部斜杠（除非是根路径）
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1)
    }

    // 转小写主机名
    url.hostname = url.hostname.toLowerCase()

    return url.href
  } catch {
    return urlString
  }
}

/**
 * 提取根域名
 *
 * @param hostname - 主机名
 * @returns 根域名
 *
 * @example
 * extractRootDomain('docs.example.com') // => 'example.com'
 * extractRootDomain('example.com') // => 'example.com'
 */
export function extractRootDomain(hostname: string): string {
  const parts = hostname.split('.')
  if (parts.length <= 2) return hostname

  // 简单处理：取最后两段
  // 注意：这不处理 .co.uk 等特殊情况，可后续扩展
  return parts.slice(-2).join('.')
}

/**
 * 提取子域名
 *
 * @param hostname - 主机名
 * @returns 子域名，如果没有则返回空字符串
 *
 * @example
 * extractSubdomain('docs.example.com') // => 'docs'
 * extractSubdomain('www.docs.example.com') // => 'www.docs'
 * extractSubdomain('example.com') // => ''
 */
export function extractSubdomain(hostname: string): string {
  const parts = hostname.split('.')
  if (parts.length <= 2) return ''

  return parts.slice(0, -2).join('.')
}

/**
 * 检查两个 URL 是否同域名
 *
 * @param url1 - 第一个 URL
 * @param url2 - 第二个 URL（通常是种子 URL）
 * @param allowedSubdomains - 允许的子域名列表
 * @returns 是否同域名
 *
 * @example
 * isSameDomain('https://docs.example.com/page', 'https://example.com')
 * // => true (同根域名)
 *
 * isSameDomain('https://docs.example.com/page', 'https://example.com', ['docs'])
 * // => true (子域名在白名单)
 *
 * isSameDomain('https://other.com/page', 'https://example.com')
 * // => false (不同域名)
 */
export function isSameDomain(
  url1: string,
  url2: string,
  allowedSubdomains?: string[]
): boolean {
  try {
    const host1 = new URL(url1).hostname.toLowerCase()
    const host2 = new URL(url2).hostname.toLowerCase()

    // 完全相同
    if (host1 === host2) return true

    // 提取根域名
    const root1 = extractRootDomain(host1)
    const root2 = extractRootDomain(host2)

    // 根域名不同，直接返回 false
    if (root1 !== root2) return false

    // 根域名相同，检查子域名白名单
    if (allowedSubdomains?.length) {
      const subdomain = extractSubdomain(host1)
      // 如果没有子域名，或者子域名在白名单中
      return subdomain === '' || allowedSubdomains.includes(subdomain)
    }

    // 默认允许同根域名
    return true
  } catch {
    return false
  }
}

/**
 * 检查 URL 是否可爬取
 *
 * 过滤掉非 HTTP 协议、资源文件等
 *
 * @param url - 要检查的 URL
 * @returns 是否可爬取
 */
export function isCrawlableUrl(url: string): boolean {
  try {
    const parsed = new URL(url)

    // 只允许 http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false
    }

    // 排除常见资源文件扩展名
    const excludeExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.rar', '.7z', '.tar', '.gz',
      '.mp3', '.mp4', '.avi', '.mov', '.wmv',
      '.css', '.js', '.json', '.xml',
      '.woff', '.woff2', '.ttf', '.eot'
    ]

    const pathname = parsed.pathname.toLowerCase()
    if (excludeExtensions.some(ext => pathname.endsWith(ext))) {
      return false
    }

    return true
  } catch {
    return false
  }
}

/**
 * 将相对 URL 转换为绝对 URL
 *
 * @param href - 相对或绝对 URL
 * @param baseUrl - 基础 URL
 * @returns 绝对 URL，如果无效则返回 null
 */
export function toAbsoluteUrl(href: string, baseUrl: string): string | null {
  try {
    // 过滤无效链接
    if (
      !href ||
      href.startsWith('javascript:') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('data:') ||
      href === '#'
    ) {
      return null
    }

    return new URL(href, baseUrl).href
  } catch {
    return null
  }
}
