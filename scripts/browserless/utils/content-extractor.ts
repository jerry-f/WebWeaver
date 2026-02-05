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
// 根元素查找
// ============================================================================

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
 * 获取元素的普通属性（非 id、class、data-* 的有效属性）
 */
function getOtherAttrs(el: Element): Attr[] {
  const skipAttrs = new Set(['id', 'class', 'style'])
  return Array.from(el.attributes).filter(
    (attr) =>
      !skipAttrs.has(attr.name) &&
      !attr.name.startsWith('data-') &&
      attr.value &&
      !attr.value.includes('"') &&
      !attr.value.includes("'"),
  )
}

/**
 * 构建选择器：不使用 tagName，只用 id + class + data-* + 其他属性
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

  // 4. 如果以上都没有，尝试使用其他属性（如 width, name 等）
  if (parts.length === 0) {
    const otherAttrs = getOtherAttrs(el)
    for (const attr of otherAttrs.slice(0, 2)) {
      parts.push(`[${attr.name}="${attr.value}"]`)
    }
  }

  return parts.join('')
}

/**
 * 从源 DOM 中查找与 Readability 根元素匹配的原始元素
 *
 * 策略：
 * 1. 用 Readability 根元素的 id/class/data-* 构建选择器
 * 2. 在源 DOM 中查找匹配的元素列表
 * 3. 如果只有一个匹配，直接返回
 * 4. 如果有多个匹配，用子元素特征进行过滤
 * 5. 通过采样子元素的特征（id、class、文本内容）来筛选正确的元素
 */
export function findOriginalRoot(contentHtml: string, sourceDoc: Document): { element: Element | null; selector: string | null } {
  const dom = new JSDOM(contentHtml)
  const doc = dom.window.document

  // Readability 会包装一个 div#readability-page-1
  const wrapper = doc.querySelector('#readability-page-1')
  const rootElement = wrapper?.firstElementChild || doc.body.firstElementChild

  if (!rootElement) {
    return { element: null, selector: null }
  }

  /**
   * 安全地在源 DOM 中查询选择器
   */
  function queryAll(selector: string): Element[] {
    if (!selector) return []
    try {
      return [...sourceDoc.querySelectorAll(selector)]
    } catch {
      return []
    }
  }

  /**
   * 获取元素的采样特征（用于过滤匹配）
   * 优先选择有明确标识的子元素
   */
  function getSampleFeatures(el: Element): Array<{ type: 'selector' | 'text'; value: string }> {
    const features: Array<{ type: 'selector' | 'text'; value: string }> = []
    const allChildren = el.querySelectorAll('*')

    // 收集有明确特征的子元素
    const candidates: Array<{ el: Element; score: number }> = []

    allChildren.forEach((child) => {
      let score = 0
      const id = child.getAttribute('id')
      const classes = getValidClasses(child)
      const dataAttrs = getDataAttrs(child)

      // 有 id 得分最高
      if (id) score += 10
      // 有多个 class 得分较高
      score += Math.min(classes.length, 3) * 2
      // 有 data 属性也加分
      score += Math.min(dataAttrs.length, 2)

      if (score > 0) {
        candidates.push({ el: child, score })
      }
    })

    // 按得分排序，取前 5 个
    candidates.sort((a, b) => b.score - a.score)
    const topCandidates = candidates.slice(0, 5)

    for (const { el: child } of topCandidates) {
      const selector = buildSelector(child)
      if (selector) {
        features.push({ type: 'selector', value: selector })
      }
    }

    // 如果选择器特征不足，补充文本特征
    if (features.length < 3) {
      // 获取有意义的文本节点（长度适中的）
      const textNodes: string[] = []
      const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */)
      let node: Node | null
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim() || ''
        // 选择 10-100 字符的文本，避免太短或太长
        if (text.length >= 10 && text.length <= 100) {
          textNodes.push(text)
        }
      }

      // 取前 3 个文本特征
      for (const text of textNodes.slice(0, 3)) {
        features.push({ type: 'text', value: text })
      }
    }

    return features
  }

  /**
   * 检查候选元素是否包含指定特征
   */
  function hasFeature(candidate: Element, feature: { type: 'selector' | 'text'; value: string }): boolean {
    if (feature.type === 'selector') {
      try {
        return candidate.querySelector(feature.value) !== null
      } catch {
        return false
      }
    } else {
      // 文本匹配
      return candidate.textContent?.includes(feature.value) || false
    }
  }

  /**
   * 用特征过滤候选元素列表
   */
  function filterByFeatures(candidates: Element[], features: Array<{ type: 'selector' | 'text'; value: string }>): Element[] {
    if (candidates.length <= 1 || features.length === 0) {
      return candidates
    }

    let filtered = [...candidates]

    for (const feature of features) {
      const matched = filtered.filter((c) => hasFeature(c, feature))
      // 如果这个特征能进一步过滤，就使用过滤结果
      if (matched.length > 0 && matched.length < filtered.length) {
        filtered = matched
      }
      // 如果已经只剩一个，提前返回
      if (filtered.length === 1) {
        break
      }
    }

    return filtered
  }

  // ========================================
  // 步骤 1: 构建选择器并查找匹配
  // ========================================
  const fullSelector = buildSelector(rootElement)
  let matchList = queryAll(fullSelector)

  // 如果完整选择器没有匹配，尝试更宽松的选择器
  if (matchList.length === 0) {
    // 尝试只用 id
    const id = rootElement.getAttribute('id')
    if (id && id !== 'readability-page-1') {
      matchList = queryAll(`#${id}`)
    }

    // 尝试只用 class
    if (matchList.length === 0) {
      const classes = getValidClasses(rootElement)
      if (classes.length > 0) {
        // 尝试所有 class
        matchList = queryAll(classes.map((c) => `.${c}`).join(''))

        // 如果还是没有，尝试单个 class
        if (matchList.length === 0) {
          for (const cls of classes) {
            matchList = queryAll(`.${cls}`)
            if (matchList.length > 0) break
          }
        }
      }
    }

    // 尝试 data 属性
    if (matchList.length === 0) {
      const dataAttrs = getDataAttrs(rootElement)
      if (dataAttrs.length > 0) {
        const attr = dataAttrs[0]
        matchList = queryAll(`[${attr.name}="${attr.value}"]`)
      }
    }
  }

  // 没有找到任何匹配
  if (matchList.length === 0) {
    return { element: null, selector: null }
  }

  // ========================================
  // 步骤 2: 如果只有一个匹配，直接返回
  // ========================================
  if (matchList.length === 1) {
    return { element: matchList[0], selector: fullSelector }
  }

  // ========================================
  // 步骤 3: 多个匹配，用子元素特征过滤
  // ========================================
  const features = getSampleFeatures(rootElement)
  const filtered = filterByFeatures(matchList, features)

  if (filtered.length === 1) {
    return { element: filtered[0], selector: fullSelector }
  }

  // ========================================
  // 步骤 4: 仍有多个，返回第一个（通常是正确的）
  // ========================================
  // 在 DOM 中越靠前的元素通常是主要内容区域
  return { element: filtered[0] || matchList[0], selector: fullSelector }
}

/**
 * 从 Readability 提取的内容中获取根元素选择器（兼容旧 API）
 * @deprecated 请使用 findOriginalRoot 代替
 */
export function extractRootSelector(contentHtml: string, sourceDoc?: Document): string | null {
  if (!sourceDoc) return null
  const { selector } = findOriginalRoot(contentHtml, sourceDoc)
  return selector
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

    // 4. 从源 DOM 查找原始根元素
    const { element: originalRoot, selector: rootSelector } = findOriginalRoot(article.content, sourceDoc)

    if (!originalRoot) {
      result.error = '无法在源 DOM 中找到匹配的根元素'
      return result
    }

    result.selector = rootSelector

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
