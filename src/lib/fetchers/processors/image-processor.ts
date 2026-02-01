/**
 * 图片处理器
 *
 * 处理文章中的图片：
 * 1. 懒加载属性转换（data-src → src）
 * 2. 相对 URL 转绝对 URL
 * 3. 生成代理 URL（可选，用于绕过防盗链）
 */

/**
 * 提取的图片信息
 */
export interface ExtractedImage {
  /** 原始 URL */
  originalUrl: string
  /** 代理后的 URL */
  proxyUrl?: string
  /** alt 文本 */
  alt?: string
  /** 是否为懒加载图片 */
  isLazy: boolean
}

/**
 * 图片处理配置
 */
export interface ImageProcessorConfig {
  /** 是否启用代理 */
  enableProxy?: boolean
  /** 代理 API 基础路径 */
  proxyBaseUrl?: string
  /** 懒加载属性列表 */
  lazyAttributes?: string[]
}

/**
 * 默认懒加载属性
 */
const DEFAULT_LAZY_ATTRIBUTES = [
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-actualsrc',
  'data-hi-res-src',
  'data-lazy',
  'data-echo'
]

/**
 * 处理 HTML 中的图片
 *
 * @param html - HTML 内容
 * @param baseUrl - 基础 URL（用于解析相对路径）
 * @param config - 处理配置
 * @returns 处理后的 HTML 和提取的图片列表
 */
export function processImages(
  html: string,
  baseUrl: string,
  config: ImageProcessorConfig = {}
): { html: string; images: ExtractedImage[] } {
  const {
    enableProxy = false,
    proxyBaseUrl = '/api/image-proxy',
    lazyAttributes = DEFAULT_LAZY_ATTRIBUTES
  } = config

  const images: ExtractedImage[] = []

  // 使用正则表达式处理图片（避免在 Node.js 中使用 DOM）
  let processedHtml = html

  // 匹配所有 img 标签
  const imgRegex = /<img([^>]*)>/gi
  processedHtml = processedHtml.replace(imgRegex, (match, attrs: string) => {
    let newAttrs = attrs
    let originalUrl: string | null = null
    let isLazy = false
    let alt: string | undefined

    // 提取 alt 属性
    const altMatch = attrs.match(/alt=["']([^"']*)["']/i)
    if (altMatch) {
      alt = altMatch[1]
    }

    // 检查懒加载属性
    for (const lazyAttr of lazyAttributes) {
      const lazyRegex = new RegExp(`${lazyAttr}=["']([^"']+)["']`, 'i')
      const lazyMatch = attrs.match(lazyRegex)
      if (lazyMatch && lazyMatch[1]) {
        const lazySrc = lazyMatch[1]
        if (lazySrc.startsWith('http') || lazySrc.startsWith('/')) {
          originalUrl = lazySrc
          isLazy = true
          // 将懒加载 URL 设置为 src
          if (attrs.includes('src=')) {
            newAttrs = newAttrs.replace(/src=["'][^"']*["']/i, `src="${lazySrc}"`)
          } else {
            newAttrs += ` src="${lazySrc}"`
          }
          break
        }
      }
    }

    // 如果没有懒加载，提取现有的 src
    if (!originalUrl) {
      const srcMatch = attrs.match(/src=["']([^"']+)["']/i)
      if (srcMatch && srcMatch[1]) {
        originalUrl = srcMatch[1]
      }
    }

    // 跳过 data: URLs 和空 src
    if (!originalUrl || originalUrl.startsWith('data:')) {
      return match
    }

    // 转换为绝对 URL
    try {
      const absoluteUrl = new URL(originalUrl, baseUrl).href
      originalUrl = absoluteUrl

      // 更新 src 为绝对 URL
      if (newAttrs.includes('src=')) {
        newAttrs = newAttrs.replace(/src=["'][^"']*["']/i, `src="${absoluteUrl}"`)
      }

      // 生成代理 URL（如果启用）
      let proxyUrl: string | undefined
      if (enableProxy && absoluteUrl.startsWith('http')) {
        proxyUrl = `${proxyBaseUrl}?url=${encodeURIComponent(absoluteUrl)}`
        newAttrs = newAttrs.replace(/src=["'][^"']*["']/i, `src="${proxyUrl}"`)
      }

      // 记录图片信息
      images.push({
        originalUrl: absoluteUrl,
        proxyUrl,
        alt,
        isLazy
      })
    } catch {
      // URL 解析失败，保持原样
    }

    // 添加懒加载属性
    if (!newAttrs.includes('loading=')) {
      newAttrs += ' loading="lazy"'
    }
    if (!newAttrs.includes('decoding=')) {
      newAttrs += ' decoding="async"'
    }

    return `<img${newAttrs}>`
  })

  // 处理 srcset 中的懒加载
  processedHtml = processedHtml.replace(/data-srcset=["']([^"']+)["']/gi, 'srcset="$1"')

  return { html: processedHtml, images }
}

/**
 * 生成图片代理 URL
 *
 * @param originalUrl - 原始图片 URL
 * @param proxyBaseUrl - 代理 API 基础路径
 * @returns 代理 URL
 */
export function generateProxyUrl(originalUrl: string, proxyBaseUrl = '/api/image-proxy'): string {
  return `${proxyBaseUrl}?url=${encodeURIComponent(originalUrl)}`
}

/**
 * 从 HTML 中提取所有图片 URL
 *
 * @param html - HTML 内容
 * @param baseUrl - 基础 URL
 * @returns 图片 URL 列表
 */
export function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = []
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
  let match

  while ((match = imgRegex.exec(html)) !== null) {
    try {
      const absoluteUrl = new URL(match[1], baseUrl).href
      if (absoluteUrl.startsWith('http')) {
        urls.push(absoluteUrl)
      }
    } catch {
      // 忽略无效 URL
    }
  }

  return urls
}
