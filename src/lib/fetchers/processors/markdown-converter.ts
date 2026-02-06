/**
 * Markdown 转 HTML 转换器
 *
 * 将 AI 提取的 Markdown 转换为安全的 HTML
 */

import { marked, Renderer } from 'marked'
import { sanitizeHtml } from './html-sanitizer'

/**
 * 转换选项
 */
export interface MarkdownConvertOptions {
  /** 文章的基础 URL（用于相对路径转换） */
  baseUrl?: string
  /** 是否启用 GFM（GitHub Flavored Markdown） */
  gfm?: boolean
  /** 是否将换行转为 <br> */
  breaks?: boolean
}

/**
 * 自定义渲染器
 */
function createRenderer(baseUrl?: string): Renderer {
  const renderer = new Renderer()

  // 处理图片：添加懒加载、错误处理
  renderer.image = ({ href, title, text }) => {
    // 处理相对路径
    const absoluteUrl = resolveUrl(href, baseUrl)
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
    const altText = text ? escapeHtml(text) : ''

    return `<figure>
      <img src="${absoluteUrl}" alt="${altText}"${titleAttr} loading="lazy" decoding="async" onerror="this.style.display='none'">
      ${text ? `<figcaption>${escapeHtml(text)}</figcaption>` : ''}
    </figure>`
  }

  // 处理链接：添加安全属性
  renderer.link = ({ href, title, text }) => {
    const absoluteUrl = resolveUrl(href, baseUrl)
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''

    // 外部链接添加安全属性
    if (absoluteUrl.startsWith('http')) {
      return `<a href="${absoluteUrl}"${titleAttr} target="_blank" rel="noopener noreferrer nofollow">${text}</a>`
    }

    return `<a href="${absoluteUrl}"${titleAttr}>${text}</a>`
  }

  // 处理代码块：添加语言类名
  renderer.code = ({ text, lang }) => {
    const language = lang || 'plaintext'
    const escapedCode = escapeHtml(text)
    return `<pre><code class="language-${language}">${escapedCode}</code></pre>`
  }

  return renderer
}

/**
 * 将 Markdown 转换为安全的 HTML
 *
 * @param markdown - Markdown 内容
 * @param options - 转换选项
 * @returns 安全的 HTML 内容
 */
export function markdownToHtml(
  markdown: string,
  options: MarkdownConvertOptions = {}
): string {
  const { baseUrl, gfm = true, breaks = true } = options

  // 配置 marked
  marked.setOptions({
    gfm,
    breaks,
    renderer: createRenderer(baseUrl)
  })

  // 转换为 HTML
  const rawHtml = marked.parse(markdown) as string

  // 使用现有的 sanitizeHtml 进行安全净化
  return sanitizeHtml(rawHtml)
}

/**
 * 解析相对 URL 为绝对 URL
 */
function resolveUrl(href: string, baseUrl?: string): string {
  if (!href) return ''

  // 已经是绝对 URL
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href
  }

  // 协议相对 URL
  if (href.startsWith('//')) {
    return 'https:' + href
  }

  // 有基础 URL 时转换相对路径
  if (baseUrl) {
    try {
      return new URL(href, baseUrl).href
    } catch {
      return href
    }
  }

  return href
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, char => map[char])
}
