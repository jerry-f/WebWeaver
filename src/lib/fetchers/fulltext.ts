import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

/**
 * 抓取文章全文内容
 *
 * 访问文章原始 URL，使用 Mozilla 的 Readability 库提取正文内容
 * Readability 是 Firefox 阅读模式使用的同一技术，能够：
 * - 自动识别页面中的主要内容区域
 * - 过滤掉导航栏、侧边栏、广告、评论等干扰元素
 * - 提取纯净的文章正文
 *
 * @param url - 文章页面的 URL
 * @returns 返回包含正文和标题的对象，失败时返回 null
 *
 * @example
 * const result = await fetchFullText('https://example.com/article/123')
 * if (result) {
 *   console.log(result.content)  // 纯文本正文
 *   console.log(result.title)    // 文章标题
 * }
 */
export async function fetchFullText(url: string): Promise<{ content: string; title?: string } | null> {
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

    // ========== 第三步：使用 Readability 提取正文 ==========
    // Readability 会分析 DOM 结构，识别并提取主要内容
    // 它会给页面中的各个元素打分，选择得分最高的区域作为正文
    const reader = new Readability(dom.window.document)
    const article = reader.parse()

    // 如果无法解析出文章（可能是非文章页面），返回 null
    if (!article || !article.textContent) return null

    // ========== 第四步：返回提取结果 ==========
    return {
      // textContent 是去除 HTML 标签后的纯文本内容
      content: article.textContent.trim(),
      // 提取到的文章标题（可能与页面 <title> 不同）
      title: article.title || undefined
    }
  } catch (e) {
    // 捕获所有错误（网络错误、超时、解析错误等）
    // 记录错误日志但不中断整体抓取流程
    console.error('Failed to fetch full text:', url, e)
    return null
  }
}
