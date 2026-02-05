/**
 * 内容提取器模块
 *
 * 【功能说明】
 * 1. extractRootSelector: 从 Readability 内容中提取根元素选择器
 * 2. sanitizeHtml: 净化 HTML，移除冗余属性和元素
 * 3. extractFullContent: 完整的内容提取流程
 */

import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { join } from 'path'
import { writeFileSync, existsSync, mkdirSync } from 'fs'

// ============================================================================
// 类型定义
// ============================================================================

export interface ExtractResult {
  success: boolean
  title: string
  selector: string | null
  rawHtml: string
  fullContent: string
  sanitizedContent: string
  stats: {
    rawLength: number
    readabilityLength: number
    fullLength: number
    sanitizedLength: number
  }
  error?: string
}

export interface SanitizeOptions {
  baseUrl?: string
  removeSelectors?: string[]
  allowedAttributes?: Record<string, Set<string>>
}

// ============================================================================
// 常量配置
// ============================================================================

/**
 * 懒加载属性列表
 */
const LAZY_ATTRIBUTES = [
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-actualsrc',
  'data-hi-res-src',
  'data-lazy',
  'data-echo',
]

/**
 * 需要保留的属性（白名单）
 */
const DEFAULT_ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  source: new Set(['src', 'srcset', 'type', 'media']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  time: new Set(['datetime']),
  abbr: new Set(['title']),
  blockquote: new Set(['cite']),
  q: new Set(['cite']),
  '*': new Set(['id']),
}

/**
 * 需要移除的元素选择器
 */
const DEFAULT_REMOVE_SELECTORS = [
  'button',
  '[role="button"]',
  'svg',
  '[data-floating-buttons]',
  '[data-testid*="copy"]',
  '[aria-label*="复制"]',
  '[aria-label*="询问"]',
  '.absolute a[aria-label*="导航"]',
  'a[aria-label*="导航到标题"]',
  '[aria-hidden="true"]',
  '[role="tablist"]',
  '[role="tabpanel"].hidden',
  '.hidden[role="tabpanel"]',
  '[data-fade-overlay]',
  'script',
  'style',
  'noscript',
  'iframe',
]

// ============================================================================
// 选择器提取
// ============================================================================

/**
 * 从 Readability 提取的内容中获取根元素选择器
 *
 * 策略：
 * 1. 不使用 tagName（因为 Readability 可能修改元素标签名）
 * 2. 使用 id + class + data-* 属性构建选择器
 * 3. 在源 DOM 中验证唯一性
 * 4. 如果不唯一，通过子元素特征进一步筛选
 * 5. 逐步降级直到找到唯一匹配
 */
export function extractRootSelector(contentHtml: string, sourceDoc?: Document): string | null {
  const dom = new JSDOM(contentHtml)
  const doc = dom.window.document

  // Readability 会包装一个 div#readability-page-1
  const wrapper = doc.querySelector('#readability-page-1')
  const rootElement = wrapper?.firstElementChild || doc.body.firstElementChild

  if (!rootElement) return null

  /**
   * 获取元素的有效 class 列表
   */
  function getValidClasses(el: Element): string[] {
    const classList = el.getAttribute('class')
    if (!classList) return []
    return classList
      .split(/\s+/)
      .filter((c) => c.length > 0 && !c.includes('[') && !c.includes(']') && !c.includes(':') && !c.includes('/'))
  }

  /**
   * 获取元素的 data-* 属性
   */
  function getDataAttrs(el: Element): Attr[] {
    return Array.from(el.attributes).filter(
      (attr) => attr.name.startsWith('data-') && attr.value && !attr.value.includes('"') && !attr.value.includes("'"),
    )
  }

  /**
   * 构建选择器：不使用 tagName，只用 id + class + data-* 属性
   */
  function buildSelector(el: Element): string {
    const parts: string[] = []

    // 1. id（最可靠）
    const id = el.getAttribute('id')
    if (id && id !== 'readability-page-1') {
      parts.push(`#${id}`)
    }

    // 2. 所有有效 class
    const validClasses = getValidClasses(el)
    if (validClasses.length > 0) {
      parts.push(validClasses.map((c) => `.${c}`).join(''))
    }

    // 3. data-* 属性
    const dataAttrs = getDataAttrs(el)
    for (const attr of dataAttrs) {
      parts.push(`[${attr.name}="${attr.value}"]`)
    }

    return parts.join('')
  }

  /**
   * 验证选择器在源 DOM 中的匹配数量
   */
  function countMatches(selector: string): number {
    if (!sourceDoc || !selector) return -1
    try {
      return sourceDoc.querySelectorAll(selector).length
    } catch {
      return -1
    }
  }

  /**
   * 获取元素的第一个有意义的子元素特征（不使用 tagName）
   */
  function getChildSelector(el: Element): string | null {
    const firstChild = el.firstElementChild
    if (!firstChild) return null

    // 优先使用 id
    const id = firstChild.getAttribute('id')
    if (id) return ` > #${id}`

    // 其次使用第一个有效 class
    const validClasses = getValidClasses(firstChild)
    if (validClasses.length > 0) {
      return ` > .${validClasses[0]}`
    }

    // 使用 data-* 属性
    const dataAttrs = getDataAttrs(firstChild)
    if (dataAttrs.length > 0) {
      const attr = dataAttrs[0]
      return ` > [${attr.name}="${attr.value}"]`
    }

    return null
  }

  // 步骤 1: 构建完整选择器（不含 tagName）
  const fullSelector = buildSelector(rootElement)
  let matchCount = countMatches(fullSelector)

  if (matchCount === 1) {
    return fullSelector
  }

  // 步骤 2: 逐步简化

  // 2.1 只用 id
  const id = rootElement.getAttribute('id')
  if (id && id !== 'readability-page-1') {
    const idSelector = `#${id}`
    matchCount = countMatches(idSelector)
    if (matchCount === 1) {
      return idSelector
    }

    // 2.2 id + 子元素特征
    const childSelector = getChildSelector(rootElement)
    console.log('id + 子元素特征:', idSelector, childSelector)
    if (childSelector) {
      const idWithChild = `${idSelector}${childSelector}`
      matchCount = countMatches(idWithChild)
      if (matchCount === 1) {
        return idWithChild
      }
    }
  }

  // 2.3 只用有效 class
  const validClasses = getValidClasses(rootElement)
  if (validClasses.length > 0) {
    const classSelector = validClasses.map((c) => `.${c}`).join('')
    matchCount = countMatches(classSelector)
    if (matchCount === 1) {
      return classSelector
    }

    // 2.4 class + 子元素特征
    const childSelector = getChildSelector(rootElement)
    console.log('class + 子元素特征:', classSelector, childSelector)
    if (childSelector && matchCount > 1) {
      const classWithChild = `${classSelector}${childSelector}`
      matchCount = countMatches(classWithChild)
      if (matchCount === 1) {
        return classWithChild
      }
    }

    // 2.5 逐步减少 class 数量
    for (let i = validClasses.length - 1; i >= 1; i--) {
      const partialSelector = validClasses
        .slice(0, i)
        .map((c) => `.${c}`)
        .join('')
      matchCount = countMatches(partialSelector)
      if (matchCount === 1) {
        return partialSelector
      }
    }
  }

  // 步骤 3: 使用 data 属性
  const dataAttrs = getDataAttrs(rootElement)
  if (dataAttrs.length > 0) {
    const attr = dataAttrs[0]
    const dataSelector = `[${attr.name}="${attr.value}"]`
    matchCount = countMatches(dataSelector)
    if (matchCount === 1) {
      return dataSelector
    }
  }

  // 步骤 4: 兜底 - 返回最可能有效的选择器
  if (id && id !== 'readability-page-1') {
    return `#${id}`
  }

  if (validClasses.length > 0) {
    return `.${validClasses[0]}`
  }

  if (dataAttrs.length > 0) {
    const attr = dataAttrs[0]
    return `[${attr.name}="${attr.value}"]`
  }

  // 无法构建有效选择器
  return null
}

// ============================================================================
// HTML 净化
// ============================================================================

/**
 * 从代码元素中提取纯文本
 */
function extractCodeText(codeEl: Element): string {
  const lines = codeEl.querySelectorAll('.line')
  if (lines.length > 0) {
    return Array.from(lines)
      .map((line) => line.textContent || '')
      .join('\n')
  }
  return codeEl.textContent || ''
}

/**
 * 净化 HTML
 */
export function sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
  const {
    baseUrl,
    removeSelectors = DEFAULT_REMOVE_SELECTORS,
    allowedAttributes = DEFAULT_ALLOWED_ATTRIBUTES,
  } = options

  const dom = new JSDOM(html, { url: baseUrl })
  const document = dom.window.document

  // 1. 移除不需要的元素
  for (const selector of removeSelectors) {
    try {
      document.querySelectorAll(selector).forEach((el) => el.remove())
    } catch {
      // 选择器语法错误，跳过
    }
  }

  // 2. 特殊元素转换

  // 2.1 span[data-as="p"] → p
  document.querySelectorAll('span[data-as="p"]').forEach((span) => {
    const p = document.createElement('p')
    p.innerHTML = span.innerHTML
    span.replaceWith(p)
  })

  // 2.2 代码块处理
  document.querySelectorAll('.code-block, [class*="code-block"]').forEach((block) => {
    const codeEl = block.querySelector('code')
    if (codeEl) {
      const language = codeEl.getAttribute('language') || ''
      const codeText = extractCodeText(codeEl)

      const pre = document.createElement('pre')
      const code = document.createElement('code')
      if (language) {
        code.setAttribute('class', `language-${language}`)
      }
      code.textContent = codeText
      pre.appendChild(code)
      block.replaceWith(pre)
    }
  })

  // 2.3 Tab 容器处理
  document.querySelectorAll('.tabs, [class*="tab-container"]').forEach((container) => {
    const activePanel = container.querySelector('[role="tabpanel"]:not(.hidden)')
    if (activePanel) {
      const div = document.createElement('div')
      div.innerHTML = activePanel.innerHTML
      container.replaceWith(div)
    }
  })

  // 2.4 卡片链接简化
  document.querySelectorAll('a[href]').forEach((link) => {
    const heading = link.querySelector('h2, h3')
    const description = link.querySelector('p')

    if (heading && description) {
      const headingText = heading.textContent?.trim() || ''
      const descText = description.textContent?.trim() || ''
      const href = link.getAttribute('href') || ''
      const target = link.getAttribute('target')
      const rel = link.getAttribute('rel')

      const newLink = document.createElement('a')
      newLink.setAttribute('href', href)
      if (target) newLink.setAttribute('target', target)
      if (rel) newLink.setAttribute('rel', rel)

      const h3 = document.createElement('h3')
      h3.textContent = headingText

      const p = document.createElement('p')
      p.textContent = descText

      newLink.appendChild(h3)
      newLink.appendChild(p)
      link.replaceWith(newLink)
    }
  })

  // 3. 清理属性
  document.querySelectorAll('*').forEach((el) => {
    const tagName = el.tagName.toLowerCase()
    const allowedForTag = allowedAttributes[tagName] || new Set()
    const allowedGlobal = allowedAttributes['*'] || new Set()
    const allowed = new Set([...allowedForTag, ...allowedGlobal])

    Array.from(el.attributes).forEach((attr) => {
      if (!allowed.has(attr.name)) {
        el.removeAttribute(attr.name)
      }
    })
  })

  // 4. 移除空元素
  for (let i = 0; i < 3; i++) {
    document.querySelectorAll('div:empty, span:empty').forEach((el) => el.remove())
  }

  // 5. 扁平化嵌套 div
  for (let i = 0; i < 3; i++) {
    document.querySelectorAll('div > div:only-child').forEach((innerDiv) => {
      const parentDiv = innerDiv.parentElement
      if (parentDiv && parentDiv.tagName === 'DIV' && !parentDiv.id) {
        parentDiv.innerHTML = innerDiv.innerHTML
      }
    })
  }

  return document.body.innerHTML
}

/**
 * 格式化 HTML
 */
export function formatHtml(html: string): string {
  return html
    .replace(/>\s+</g, '>\n<')
    .replace(/<\/(h[1-6]|p|ul|ol|li|pre|blockquote|div|section|article)>/g, '</$1>\n')
    .replace(/<(h[1-6]|p|ul|ol|pre|blockquote|div|section|article)/g, '\n<$1')
    .replace(/\n\n+/g, '\n\n')
    .trim()
}

// ============================================================================
// 完整提取流程
// ============================================================================

/**
 * 处理懒加载图片
 */
function processLazyImages(document: Document): number {
  const imgElements = document.querySelectorAll('img')
  let count = 0

  imgElements.forEach((img) => {
    for (const attr of LAZY_ATTRIBUTES) {
      const lazySrc = img.getAttribute(attr)
      if (lazySrc && (lazySrc.startsWith('http') || lazySrc.startsWith('/'))) {
        img.setAttribute('src', lazySrc)
        count++
        break
      }
    }
    const dataSrcset = img.getAttribute('data-srcset')
    if (dataSrcset) {
      img.setAttribute('srcset', dataSrcset)
    }
  })

  return count
}

/**
 * 完整的内容提取流程
 *
 * @param html - 原始 HTML
 * @param url - 页面 URL
 * @returns 提取结果
 */
export function extractFullContent(html: string, url: string, createFile: boolean = false): ExtractResult {
  const result: ExtractResult = {
    success: false,
    title: '',
    selector: null,
    rawHtml: html,
    fullContent: '',
    sanitizedContent: '',
    stats: {
      rawLength: html.length,
      readabilityLength: 0,
      fullLength: 0,
      sanitizedLength: 0,
    },
  }

  try {
    // 1. 创建两个 DOM
    const sourceDom = new JSDOM(html, { url })
    const sourceDoc = sourceDom.window.document

    const readabilityDom = new JSDOM(html, { url })
    const readabilityDoc = readabilityDom.window.document

    const OUTPUT_DIR = join(process.cwd(), 'scripts/browserless/output-test')
    // 确保输出目录存在
    if (createFile && !existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true })
    }

    if (createFile) {
      // 保存原始 HTML
      writeFileSync(join(OUTPUT_DIR, `${url.replace(/[:\/]/g, '_')}-raw.html`), html)
    }

    // 2. 处理懒加载图片
    processLazyImages(sourceDoc)
    processLazyImages(readabilityDoc)

    // 3. Readability 分析
    const reader = new Readability(readabilityDoc, {
      charThreshold: 0,
      nbTopCandidates: 10,
      keepClasses: true,
    })
    const article = reader.parse()

    if (createFile) {
      const articleFilePath = join(OUTPUT_DIR, `${url.replace(/[:\/]/g, '_')}-readability.html`)
      writeFileSync(articleFilePath, article?.content || '<!-- No content extracted -->')
    }

    if (!article || !article.content) {
      result.error = 'Readability 无法识别内容区域'
      return result
    }

    result.title = article.title || ''
    result.stats.readabilityLength = article.content.length

    // 4. 提取根元素选择器
    const rootSelector = extractRootSelector(article.content, sourceDoc)

    if (!rootSelector) {
      result.error = '无法提取根元素选择器'
      return result
    }

    result.selector = rootSelector

    // 5. 从源 DOM 获取完整内容
    const originalRoot = sourceDoc.querySelector(rootSelector)

    if (!originalRoot) {
      result.error = `在源 DOM 中找不到: ${rootSelector}`
      return result
    }

    result.fullContent = originalRoot.outerHTML
    result.stats.fullLength = result.fullContent.length

    if (createFile) {
      // 保存完整原始内容
      writeFileSync(join(OUTPUT_DIR, `${url.replace(/[:\/]/g, '_')}-full.html`), result.fullContent)
    }

    // 6. 净化 HTML
    const sanitized = sanitizeHtml(result.fullContent, { baseUrl: url })
    result.sanitizedContent = formatHtml(sanitized)
    result.stats.sanitizedLength = result.sanitizedContent.length

    result.success = true
    return result
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    return result
  }
}
