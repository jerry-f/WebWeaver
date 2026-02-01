import DOMPurify, { Config } from 'isomorphic-dompurify'

/**
 * HTML 净化配置
 *
 * 白名单策略：只允许安全的标签和属性
 * 防止 XSS 攻击，同时保留文章排版
 */
const SANITIZE_CONFIG: Config = {
  // 允许的标签（保留文章排版所需的所有标签）
  ALLOWED_TAGS: [
    // 文本结构
    'p', 'br', 'hr', 'div', 'span',
    // 标题
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // 列表
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // 文本格式
    'b', 'i', 'strong', 'em', 'u', 's', 'strike', 'del', 'ins',
    'sub', 'sup', 'small', 'mark', 'abbr',
    // 引用和代码
    'blockquote', 'pre', 'code', 'kbd', 'samp', 'var',
    // 链接和媒体
    'a', 'img', 'figure', 'figcaption', 'picture', 'source',
    // 表格
    'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
    // 其他
    'address', 'cite', 'q', 'time', 'details', 'summary'
  ],

  // 允许的属性
  ALLOWED_ATTR: [
    // 通用
    'class', 'id', 'title', 'lang', 'dir',
    // 链接
    'href', 'target', 'rel',
    // 图片
    'src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading', 'decoding',
    // 表格
    'colspan', 'rowspan', 'scope',
    // 时间
    'datetime',
    // 引用
    'cite'
  ],

  // 禁止的标签（始终移除）
  FORBID_TAGS: [
    'script', 'style', 'iframe', 'form', 'input', 'button', 'textarea', 'select',
    'object', 'embed', 'meta', 'base', 'link', 'noscript'
  ],

  // 禁止的属性（始终移除）
  FORBID_ATTR: [
    'style',  // 移除内联样式，防止 CSS 注入
    'onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'onblur',
    'onsubmit', 'onreset', 'onkeydown', 'onkeyup', 'onkeypress'
  ],

  // 禁止 data-* 属性（减少攻击面，懒加载图片已在之前处理）
  ALLOW_DATA_ATTR: false,

  // 允许 aria-* 属性（无障碍）
  ALLOW_ARIA_ATTR: true,

  // 返回字符串而非 DOM
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,

  // 不返回整个文档
  WHOLE_DOCUMENT: false
}

/**
 * 初始化 DOMPurify 钩子
 *
 * 在净化后处理特定元素
 */
function initHooks(): void {
  // 处理链接：外部链接添加安全属性
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href')
      if (href?.startsWith('http')) {
        // 外部链接在新标签页打开
        node.setAttribute('target', '_blank')
        // 安全属性：防止 window.opener 攻击和 Referer 泄露
        node.setAttribute('rel', 'noopener noreferrer nofollow')
      }
    }

    // 图片懒加载
    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy')
      node.setAttribute('decoding', 'async')
    }
  })
}

// 初始化钩子（只执行一次）
let hooksInitialized = false

/**
 * 净化 HTML 内容
 *
 * 移除潜在的 XSS 攻击代码，保留安全的排版标签
 *
 * @param html - 原始 HTML 内容
 * @returns 净化后的安全 HTML
 *
 * @example
 * const safeHtml = sanitizeHtml('<p>Hello</p><script>alert("xss")</script>')
 * // 返回: '<p>Hello</p>'
 */
export function sanitizeHtml(html: string): string {
  if (!hooksInitialized) {
    initHooks()
    hooksInitialized = true
  }

  return DOMPurify.sanitize(html, SANITIZE_CONFIG)
}

/**
 * 检查 HTML 是否包含潜在危险内容
 *
 * @param html - 要检查的 HTML
 * @returns 是否包含危险内容
 */
export function hasDangerousContent(html: string): boolean {
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+=/i,  // onclick, onerror 等
    /<iframe/i,
    /<object/i,
    /<embed/i
  ]

  return dangerousPatterns.some(pattern => pattern.test(html))
}
