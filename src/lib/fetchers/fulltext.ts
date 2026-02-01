import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { sanitizeHtml } from './processors/html-sanitizer'
import { processImages, type ExtractedImage } from './processors/image-processor'

/**
 * 全文抓取结果
 */
export interface FullTextResult {
  /** HTML 格式的正文内容（保留排版、图片、链接等） */
  content: string
  /** 纯文本内容（用于 AI 处理、搜索、阅读时间计算） */
  textContent: string
  /** 文章标题 */
  title?: string
  /** 文章摘要 */
  excerpt?: string
  /** 作者 */
  byline?: string
  /** 网站名称 */
  siteName?: string
  /** 提取的图片列表 */
  images?: ExtractedImage[]
}

/**
 * 抓取文章全文内容
 *
 * 访问文章原始 URL，使用 Mozilla 的 Readability 库提取正文内容
 * Readability 是 Firefox 阅读模式使用的同一技术，能够：
 * - 自动识别页面中的主要内容区域
 * - 过滤掉导航栏、侧边栏、广告、评论等干扰元素
 * - 提取纯净的文章正文
 *
 * 重要改进：
 * - 使用 article.content（HTML 格式）保留排版和图片
 * - 同时提供 textContent（纯文本）用于 AI 和搜索
 * - 处理懒加载图片属性（data-src 等）
 *
 * @param url - 文章页面的 URL
 * @returns 返回包含正文和标题的对象，失败时返回 null
 *
 * @example
 * const result = await fetchFullText('https://example.com/article/123')
 * if (result) {
 *   console.log(result.content)      // HTML 格式正文
 *   console.log(result.textContent)  // 纯文本正文
 *   console.log(result.title)        // 文章标题
 * }
 */
export async function fetchFullText(url: string): Promise<FullTextResult | null> {
  try {
    // ========== 第一步：获取网页 HTML ==========
    const res = await fetch(url, {
      headers: {
        // 模拟浏览器 User-Agent，避免被网站拦截
        'User-Agent': 'Mozilla/5.0 (compatible; NewsFlow/1.0)',
        // 声明接受 HTML 内容
        'Accept': 'text/html,application/xhtml+xml'
      },
      // 设置 15 秒超时，避免慢速网站阻塞整个抓取流程
      signal: AbortSignal.timeout(15000)
    })

    // 请求失败则返回 null，不抛出错误
    if (!res.ok) return null

    // ========== 第二步：解析 HTML 为 DOM ==========
    const html = await res.text()
    // 使用 jsdom 创建虚拟 DOM 环境
    // 传入 url 参数确保相对路径能正确解析
    const dom = new JSDOM(html, { url })
    const document = dom.window.document

    // ========== 第 2.5 步：处理懒加载图片 ==========
    // 很多网站使用懒加载，真实图片 URL 在 data-src 等属性中
    const lazyAttributes = ['data-src', 'data-lazy-src', 'data-original', 'data-actualsrc']
    const imgElements = document.querySelectorAll('img')
    imgElements.forEach((img) => {
      // 检查懒加载属性
      for (const attr of lazyAttributes) {
        const lazySrc = img.getAttribute(attr)
        if (lazySrc && lazySrc.startsWith('http')) {
          img.setAttribute('src', lazySrc)
          break
        }
      }
      // 处理 srcset 中的懒加载
      const dataSrcset = img.getAttribute('data-srcset')
      if (dataSrcset) {
        img.setAttribute('srcset', dataSrcset)
      }
    })

    // ========== 第三步：使用 Readability 提取正文 ==========
    // Readability 会分析 DOM 结构，识别并提取主要内容
    // 它会给页面中的各个元素打分，选择得分最高的区域作为正文
    const reader = new Readability(document)
    const article = reader.parse()

    // 如果无法解析出文章（可能是非文章页面），返回 null
    if (!article || !article.content) return null

    // ========== 第五步：处理图片（URL 绝对化、懒加载修复） ==========
    const { html: processedHtml, images } = processImages(article.content, url, {
      enableProxy: false,  // 暂不启用代理，后续 Phase 会开启
      lazyAttributes: lazyAttributes
    })

    // ========== 第六步：HTML 净化（防 XSS） ==========
    const sanitizedHtml = sanitizeHtml(processedHtml)

    // ========== 第七步：返回提取结果 ==========
    return {
      // content 是经过净化的 HTML 内容（用于展示）
      content: sanitizedHtml,
      // textContent 是纯文本（用于 AI 处理、搜索、阅读时间计算）
      textContent: article.textContent?.trim() || '',
      // 提取到的文章标题
      title: article.title || undefined,
      // 文章摘要
      excerpt: article.excerpt || undefined,
      // 作者信息
      byline: article.byline || undefined,
      // 网站名称
      siteName: article.siteName || undefined,
      // 提取的图片列表
      images
    }
  } catch (e) {
    // 捕获所有错误（网络错误、超时、解析错误等）
    // 记录错误日志但不中断整体抓取流程
    console.error('Failed to fetch full text:', url, e)
    return null
  }
}
