/**
 * 完整内容提取流程测试
 *
 * 【功能说明】
 * 整合完整的内容提取流程：
 * 1. Browserless 获取页面 HTML
 * 2. 懒加载图片处理
 * 3. Readability 识别内容区域
 * 4. 从 Readability 提取根元素选择器
 * 5. 用选择器在源 DOM 中获取完整内容
 * 6. HTML 净化
 * 7. 保存结果
 *
 * 【运行方式】
 * npx tsx scripts/browserless/13-test-full-pipeline.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { BrowserlessClient } from './utils/browserless-client'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

const client = new BrowserlessClient()
const OUTPUT_DIR = join(process.cwd(), 'scripts/browserless/output')

// 确保输出目录存在
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

// ============================================================================
// 配置常量
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
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  'a': new Set(['href', 'title', 'target', 'rel']),
  'img': new Set(['src', 'alt', 'title', 'width', 'height']),
  'source': new Set(['src', 'srcset', 'type', 'media']),
  'td': new Set(['colspan', 'rowspan']),
  'th': new Set(['colspan', 'rowspan', 'scope']),
  'time': new Set(['datetime']),
  'abbr': new Set(['title']),
  'blockquote': new Set(['cite']),
  'q': new Set(['cite']),
  '*': new Set(['id']),
}

/**
 * 需要移除的元素选择器
 */
const REMOVE_SELECTORS = [
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
]

// ============================================================================
// 工具函数
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
 * 从 Readability 提取的内容中获取根元素选择器
 *
 * 策略：
 * 1. 先使用所有属性（tagName + id + class + data-*）构建最精确的选择器
 * 2. 在源 DOM 中验证唯一性
 * 3. 如果不唯一，通过子元素特征进一步筛选
 * 4. 逐步降级直到找到唯一匹配
 */
function extractRootSelector(contentHtml: string, sourceDoc?: Document): string | null {
  const dom = new JSDOM(contentHtml)
  const doc = dom.window.document

  // Readability 会包装一个 div#readability-page-1
  const wrapper = doc.querySelector('#readability-page-1')
  const rootElement = wrapper?.firstElementChild || doc.body.firstElementChild

  if (!rootElement) return null

  /**
   * 构建选择器：尽可能使用所有属性
   */
  function buildSelector(el: Element): string {
    const parts: string[] = []

    // 1. 标签名
    const tagName = el.tagName.toLowerCase()
    parts.push(tagName)

    // 2. id
    const id = el.getAttribute('id')
    if (id && id !== 'readability-page-1') {
      parts.push(`#${id}`)
    }

    // 3. 所有 class
    const classList = el.getAttribute('class')
    if (classList) {
      const classes = classList.split(/\s+/).filter(c => c.length > 0)
      // 过滤掉可能导致选择器语法错误的 class（如 Tailwind 任意值）
      const validClasses = classes.filter(c =>
        !c.includes('[') &&
        !c.includes(']') &&
        !c.includes(':') &&
        !c.includes('/')
      )
      if (validClasses.length > 0) {
        parts.push(validClasses.map(c => `.${c}`).join(''))
      }
    }

    // 4. data-* 属性
    const dataAttrs = Array.from(el.attributes)
      .filter(attr =>
        attr.name.startsWith('data-') &&
        attr.value &&
        !attr.value.includes('"') &&
        !attr.value.includes("'")
      )
    for (const attr of dataAttrs) {
      parts.push(`[${attr.name}="${attr.value}"]`)
    }

    return parts.join('')
  }

  /**
   * 验证选择器在源 DOM 中的匹配数量
   */
  function countMatches(selector: string): number {
    if (!sourceDoc) return -1
    try {
      return sourceDoc.querySelectorAll(selector).length
    } catch {
      return -1 // 选择器语法错误
    }
  }

  /**
   * 获取元素的第一个有意义的子元素特征
   */
  function getChildSelector(el: Element): string | null {
    const firstChild = el.firstElementChild
    if (!firstChild) return null

    const tagName = firstChild.tagName.toLowerCase()
    const id = firstChild.getAttribute('id')
    const firstClass = firstChild.getAttribute('class')?.split(/\s+/)[0]

    if (id) return ` > ${tagName}#${id}`
    if (firstClass && !firstClass.includes('[') && !firstClass.includes(':')) {
      return ` > ${tagName}.${firstClass}`
    }
    return ` > ${tagName}`
  }

  // ========================================
  // 步骤 1: 构建完整选择器
  // ========================================
  const fullSelector = buildSelector(rootElement)
  console.log(`   构建的完整选择器: ${fullSelector}`)

  let matchCount = countMatches(fullSelector)
  console.log(`   源 DOM 中匹配数量: ${matchCount}`)

  if (matchCount === 1) {
    return fullSelector
  }

  // ========================================
  // 步骤 2: 如果完整选择器语法错误或匹配多个，逐步简化
  // ========================================

  // 2.1 只用 id（如果有）
  const id = rootElement.getAttribute('id')
  if (id && id !== 'readability-page-1') {
    const idSelector = `#${id}`
    matchCount = countMatches(idSelector)
    if (matchCount === 1) {
      console.log(`   使用 id 选择器: ${idSelector}`)
      return idSelector
    }

    // 2.2 id + 子元素特征
    const childSelector = getChildSelector(rootElement)
    if (childSelector) {
      const idWithChild = `${idSelector}${childSelector}`
      matchCount = countMatches(idWithChild)
      if (matchCount === 1) {
        console.log(`   使用 id + 子元素选择器: ${idWithChild}`)
        return idWithChild
      }
    }
  }

  // 2.3 tagName + 有效 class
  const classList = rootElement.getAttribute('class')
  if (classList) {
    const tagName = rootElement.tagName.toLowerCase()
    const validClasses = classList.split(/\s+/).filter(c =>
      c.length > 0 &&
      !c.includes('[') &&
      !c.includes(']') &&
      !c.includes(':') &&
      !c.includes('/')
    )

    if (validClasses.length > 0) {
      // 尝试使用所有有效 class
      const classSelector = `${tagName}${validClasses.map(c => `.${c}`).join('')}`
      matchCount = countMatches(classSelector)
      if (matchCount === 1) {
        console.log(`   使用 class 选择器: ${classSelector}`)
        return classSelector
      }

      // 2.4 class + 子元素特征
      const childSelector = getChildSelector(rootElement)
      if (childSelector && matchCount > 1) {
        const classWithChild = `${classSelector}${childSelector}`
        matchCount = countMatches(classWithChild)
        if (matchCount === 1) {
          console.log(`   使用 class + 子元素选择器: ${classWithChild}`)
          return classWithChild
        }
      }

      // 2.5 逐步减少 class 数量
      for (let i = validClasses.length - 1; i >= 1; i--) {
        const partialSelector = `${tagName}${validClasses.slice(0, i).map(c => `.${c}`).join('')}`
        matchCount = countMatches(partialSelector)
        if (matchCount === 1) {
          console.log(`   使用部分 class 选择器: ${partialSelector}`)
          return partialSelector
        }
      }
    }
  }

  // ========================================
  // 步骤 3: 使用 data 属性
  // ========================================
  const dataAttrs = Array.from(rootElement.attributes)
    .filter(attr =>
      attr.name.startsWith('data-') &&
      attr.value &&
      !attr.value.includes('"') &&
      !attr.value.includes("'")
    )
  if (dataAttrs.length > 0) {
    const tagName = rootElement.tagName.toLowerCase()
    const attr = dataAttrs[0]
    const dataSelector = `${tagName}[${attr.name}="${attr.value}"]`
    matchCount = countMatches(dataSelector)
    if (matchCount === 1) {
      console.log(`   使用 data 属性选择器: ${dataSelector}`)
      return dataSelector
    }
  }

  // ========================================
  // 步骤 4: 兜底 - 使用第一个能找到的选择器
  // ========================================
  console.log(`   ⚠️ 无法找到唯一选择器，使用兜底方案`)

  // 优先返回 id
  if (id && id !== 'readability-page-1') {
    return `#${id}`
  }

  // 返回 tagName + 第一个有效 class
  if (classList) {
    const tagName = rootElement.tagName.toLowerCase()
    const firstValidClass = classList.split(/\s+/).find(c =>
      c.length > 0 &&
      !c.includes('[') &&
      !c.includes(':')
    )
    if (firstValidClass) {
      return `${tagName}.${firstValidClass}`
    }
  }

  return rootElement.tagName.toLowerCase()
}

/**
 * 从代码元素中提取纯文本
 */
function extractCodeText(codeEl: Element): string {
  const lines = codeEl.querySelectorAll('.line')
  if (lines.length > 0) {
    return Array.from(lines)
      .map(line => line.textContent || '')
      .join('\n')
  }
  return codeEl.textContent || ''
}

/**
 * 净化 HTML
 */
function sanitizeHtml(html: string, baseUrl?: string): string {
  const dom = new JSDOM(html, { url: baseUrl })
  const document = dom.window.document

  // 1. 移除不需要的元素
  for (const selector of REMOVE_SELECTORS) {
    document.querySelectorAll(selector).forEach(el => el.remove())
  }

  // 2. 特殊元素转换

  // 2.1 span[data-as="p"] → p
  document.querySelectorAll('span[data-as="p"]').forEach(span => {
    const p = document.createElement('p')
    p.innerHTML = span.innerHTML
    span.replaceWith(p)
  })

  // 2.2 代码块处理
  document.querySelectorAll('.code-block, [class*="code-block"]').forEach(block => {
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
  document.querySelectorAll('.tabs, [class*="tab-container"]').forEach(container => {
    const activePanel = container.querySelector('[role="tabpanel"]:not(.hidden)')
    if (activePanel) {
      const div = document.createElement('div')
      div.innerHTML = activePanel.innerHTML
      container.replaceWith(div)
    }
  })

  // 2.4 卡片链接简化
  document.querySelectorAll('a[href]').forEach(link => {
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
  document.querySelectorAll('*').forEach(el => {
    const tagName = el.tagName.toLowerCase()
    const allowedForTag = ALLOWED_ATTRIBUTES[tagName] || new Set()
    const allowedGlobal = ALLOWED_ATTRIBUTES['*'] || new Set()
    const allowed = new Set([...allowedForTag, ...allowedGlobal])

    Array.from(el.attributes).forEach(attr => {
      if (!allowed.has(attr.name)) {
        el.removeAttribute(attr.name)
      }
    })
  })

  // 4. 移除空元素
  for (let i = 0; i < 3; i++) {
    document.querySelectorAll('div:empty, span:empty').forEach(el => el.remove())
  }

  // 5. 扁平化嵌套 div
  for (let i = 0; i < 3; i++) {
    document.querySelectorAll('div > div:only-child').forEach(innerDiv => {
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
function formatHtml(html: string): string {
  return html
    .replace(/>\s+</g, '>\n<')
    .replace(/<\/(h[1-6]|p|ul|ol|li|pre|blockquote|div|section|article)>/g, '</$1>\n')
    .replace(/<(h[1-6]|p|ul|ol|pre|blockquote|div|section|article)/g, '\n<$1')
    .replace(/\n\n+/g, '\n\n')
    .trim()
}

// ============================================================================
// 主流程
// ============================================================================

async function main() {
  console.log('='.repeat(70))
  console.log('完整内容提取流程测试')
  console.log('='.repeat(70))

  const url = 'https://code.claude.com/docs/zh-CN'
  console.log(`\n目标 URL: ${url}`)
  const startTime = Date.now()

  // ========================================
  // 步骤 1: 检查 Browserless 服务
  // ========================================
  console.log('\n' + '─'.repeat(70))
  console.log('📊 步骤 1: 检查 Browserless 服务状态')
  console.log('─'.repeat(70))

  try {
    const health = await client.checkHealth()
    console.log(`   ✅ 服务可用 (${health.running}/${health.maxConcurrent})`)
  } catch (error) {
    console.error('   ❌ 服务不可用:', error)
    process.exit(1)
  }

  // ========================================
  // 步骤 2: 获取页面 HTML
  // ========================================
  console.log('\n' + '─'.repeat(70))
  console.log('🌐 步骤 2: 获取页面 HTML')
  console.log('─'.repeat(70))

  let html: string
  try {
    html = await client.getContent(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    })
    console.log(`   ✅ 获取成功`)
    console.log(`   原始 HTML: ${html.length} 字符`)

    // 保存原始 HTML
    writeFileSync(join(OUTPUT_DIR, '13-raw-html.html'), html)
  } catch (error) {
    console.error('   ❌ 获取失败:', error)
    process.exit(1)
  }

  // ========================================
  // 步骤 3: 解析 HTML 并处理懒加载图片
  // ========================================
  console.log('\n' + '─'.repeat(70))
  console.log('🔧 步骤 3: 解析 HTML 并处理懒加载图片')
  console.log('─'.repeat(70))

  // 创建两个 DOM：源 DOM 和 Readability 分析用 DOM
  const sourceDom = new JSDOM(html, { url })
  const sourceDoc = sourceDom.window.document

  const readabilityDom = new JSDOM(html, { url })
  const readabilityDoc = readabilityDom.window.document

  // 处理懒加载图片
  const lazyCount1 = processLazyImages(sourceDoc)
  const lazyCount2 = processLazyImages(readabilityDoc)
  console.log(`   ✅ 懒加载图片处理: ${lazyCount1} 个`)

  // ========================================
  // 步骤 4: Readability 识别内容区域
  // ========================================
  console.log('\n' + '─'.repeat(70))
  console.log('📖 步骤 4: Readability 识别内容区域')
  console.log('─'.repeat(70))

  const reader = new Readability(readabilityDoc, {
    charThreshold: 0,
    nbTopCandidates: 10,
    keepClasses: true,
  })
  const article = reader.parse()

  if (!article || !article.content) {
    console.error('   ❌ Readability 无法识别内容区域')
    process.exit(1)
  }

  console.log(`   ✅ 识别成功`)
  console.log(`   标题: ${article.title}`)
  console.log(`   Readability 内容: ${article.content.length} 字符`)

  // ========================================
  // 步骤 5: 提取根元素选择器
  // ========================================
  console.log('\n' + '─'.repeat(70))
  console.log('🔍 步骤 5: 提取根元素选择器')
  console.log('─'.repeat(70))

  const articleFilePath = join(OUTPUT_DIR, '13-readability-content.html')
  writeFileSync(articleFilePath, article.content)
  console.log(`   ✅ Readability 内容已保存: ${articleFilePath}`)

  const rootSelector = extractRootSelector(article.content, sourceDoc)

  if (!rootSelector) {
    console.error('   ❌ 无法提取根元素选择器')
    process.exit(1)
  }

  console.log(`   ✅ 找到选择器: ${rootSelector}`)

  // ========================================
  // 步骤 6: 从源 DOM 获取完整内容
  // ========================================
  console.log('\n' + '─'.repeat(70))
  console.log('🎯 步骤 6: 从源 DOM 获取完整内容')
  console.log('─'.repeat(70))

  const originalRoot = sourceDoc.querySelector(rootSelector)

  if (!originalRoot) {
    console.error(`   ❌ 在源 DOM 中找不到: ${rootSelector}`)
    process.exit(1)
  }

  const fullContent = originalRoot.outerHTML
  console.log(`   ✅ 获取完整内容`)
  console.log(`   完整内容: ${fullContent.length} 字符`)
  console.log(`   内容增加: +${((fullContent.length / article.content.length - 1) * 100).toFixed(1)}%`)

  // 保存完整原始内容
  writeFileSync(join(OUTPUT_DIR, '13-full-content.html'), fullContent)

  // ========================================
  // 步骤 7: HTML 净化
  // ========================================
  console.log('\n' + '─'.repeat(70))
  console.log('🧹 步骤 7: HTML 净化')
  console.log('─'.repeat(70))

  const sanitizedHtml = sanitizeHtml(fullContent, url)
  const formattedHtml = formatHtml(sanitizedHtml)

  console.log(`   ✅ 净化完成`)
  console.log(`   净化后: ${formattedHtml.length} 字符`)
  console.log(`   压缩比: ${((1 - formattedHtml.length / fullContent.length) * 100).toFixed(1)}%`)

  // 保存净化后的内容
  writeFileSync(join(OUTPUT_DIR, '13-sanitized-content.html'), formattedHtml)

  // ========================================
  // 步骤 8: 生成预览页面
  // ========================================
  console.log('\n' + '─'.repeat(70))
  console.log('💾 步骤 8: 保存结果')
  console.log('─'.repeat(70))

  const previewHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${article.title || 'Extracted Content'}</title>
  <style>
    body {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #1a1a1a;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    h1 { border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
    h2 { border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul, ol { padding-left: 1.5em; }
    li { margin: 0.5em 0; }
    pre {
      background: #f5f5f5;
      padding: 15px;
      overflow-x: auto;
      border-radius: 5px;
      font-size: 14px;
    }
    code {
      background: #f0f0f0;
      padding: 2px 5px;
      border-radius: 3px;
      font-family: 'SFMono-Regular', Consolas, monospace;
    }
    pre code { background: none; padding: 0; }
    blockquote {
      border-left: 4px solid #ddd;
      margin: 1em 0;
      padding: 0.5em 1em;
      color: #666;
    }
    img { max-width: 100%; height: auto; }
    /* 卡片链接样式 */
    a:has(h3) {
      display: block;
      padding: 15px;
      margin: 10px 0;
      border: 1px solid #eee;
      border-radius: 8px;
      transition: border-color 0.2s;
    }
    a:has(h3):hover {
      border-color: #0066cc;
    }
    a:has(h3) h3 {
      margin: 0 0 5px 0;
      font-size: 1.1em;
    }
    a:has(h3) p {
      margin: 0;
      color: #666;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <h1>${article.title || 'Untitled'}</h1>
  ${article.excerpt ? `<p style="color: #666; font-style: italic;">${article.excerpt}</p>` : ''}
  <hr>
  ${formattedHtml}
</body>
</html>`

  writeFileSync(join(OUTPUT_DIR, '13-preview.html'), previewHtml)

  console.log(`   ✅ 文件已保存:`)
  console.log(`      原始 HTML: 13-raw-html.html`)
  console.log(`      完整内容: 13-full-content.html`)
  console.log(`      净化内容: 13-sanitized-content.html`)
  console.log(`      预览页面: 13-preview.html`)

  // ========================================
  // 总结
  // ========================================
  const duration = Date.now() - startTime
  console.log('\n' + '='.repeat(70))
  console.log('✅ 完整流程执行完成!')
  console.log('='.repeat(70))
  console.log(`
   总耗时: ${duration}ms
   标题: ${article.title}

   数据流:
   ┌─────────────────────────────────────────────────────────────────┐
   │ 原始 HTML        ${html.length.toString().padStart(10)} 字符                        │
   │     ↓                                                           │
   │ Readability 内容 ${article.content.length.toString().padStart(10)} 字符 (识别内容区域)           │
   │     ↓                                                           │
   │ 完整内容         ${fullContent.length.toString().padStart(10)} 字符 (+${((fullContent.length / article.content.length - 1) * 100).toFixed(0)}% 恢复被过滤内容)   │
   │     ↓                                                           │
   │ 净化后           ${formattedHtml.length.toString().padStart(10)} 字符 (-${((1 - formattedHtml.length / fullContent.length) * 100).toFixed(0)}% 移除冗余)          │
   └─────────────────────────────────────────────────────────────────┘

   预览页面: ${join(OUTPUT_DIR, '13-preview.html')}
`)
}

main().catch(console.error)
