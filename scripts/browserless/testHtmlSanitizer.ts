/**
 * HTML 净化器测试
 *
 * 【功能说明】
 * 将原始 HTML（包含大量 Tailwind 类名、内联样式、交互元素）
 * 转换为干净的语义化 HTML
 *
 * 【运行方式】
 * npx tsx scripts/browserless/testHtmlSanitizer.ts
 */

import { writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { JSDOM } from 'jsdom'
import {sanitizeHtml} from '../../src/lib/fetchers/processors/html-sanitizer'

const OUTPUT_DIR = join(process.cwd(), 'scripts/browserless/output')

/**
 * 需要保留的语义化标签
 */
const ALLOWED_TAGS = new Set([
  // 标题
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // 文本
  'p', 'span', 'strong', 'em', 'b', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup',
  // 列表
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // 链接和媒体
  'a', 'img', 'figure', 'figcaption', 'picture', 'source',
  // 代码
  'pre', 'code', 'kbd', 'samp', 'var',
  // 表格
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  // 引用
  'blockquote', 'q', 'cite',
  // 结构
  'div', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
  // 其他
  'br', 'hr', 'details', 'summary', 'time', 'abbr', 'address',
])

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
  // 保留 id 用于锚点链接
  '*': new Set(['id']),
}

/**
 * 需要移除的元素选择器
 */
const REMOVE_SELECTORS = [
  // 交互按钮
  'button',
  '[role="button"]',
  // SVG 图标（通常是装饰性的）
  'svg',
  // 复制按钮、工具栏
  '[data-floating-buttons]',
  '[data-testid*="copy"]',
  '[aria-label*="复制"]',
  '[aria-label*="询问"]',
  // 锚点链接图标
  '.absolute a[aria-label*="导航"]',
  'a[aria-label*="导航到标题"]',
  // 悬停提示
  '[aria-hidden="true"]',
  // Tab 列表（保留 Tab 内容）
  '[role="tablist"]',
  // 隐藏的 Tab 面板
  '[role="tabpanel"].hidden',
  '.hidden[role="tabpanel"]',
  // 装饰性 div
  '[data-fade-overlay]',
]

/**
 * 净化 HTML
 *
 * @param html - 原始 HTML
 * @param baseUrl - 基础 URL（用于相对链接处理）
 * @returns 净化后的 HTML
 */
function sanitizeHtml(html: string, baseUrl?: string): string {
  const dom = new JSDOM(html, { url: baseUrl })
  const document = dom.window.document

  // 1. 移除需要删除的元素
  console.log('\n🧹 步骤 1: 移除不需要的元素...')
  let removedCount = 0
  for (const selector of REMOVE_SELECTORS) {
    const elements = document.querySelectorAll(selector)
    elements.forEach(el => {
      el.remove()
      removedCount++
    })
  }
  console.log(`   移除元素: ${removedCount} 个`)

  // 2. 处理特殊元素转换
  console.log('\n🔄 步骤 2: 转换特殊元素...')

  // 2.1 将 span[data-as="p"] 转换为 p
  const spanAsP = document.querySelectorAll('span[data-as="p"]')
  spanAsP.forEach(span => {
    const p = document.createElement('p')
    p.innerHTML = span.innerHTML
    span.replaceWith(p)
  })
  console.log(`   span[data-as="p"] → p: ${spanAsP.length} 个`)

  // 2.2 提取代码块的纯文本
  const codeBlocks = document.querySelectorAll('.code-block, [class*="code-block"]')
  codeBlocks.forEach(block => {
    // 找到实际的 code 元素
    const codeEl = block.querySelector('code')
    if (codeEl) {
      // 获取语言
      const language = codeEl.getAttribute('language') || ''

      // 提取纯文本代码（移除行号等装饰）
      const codeText = extractCodeText(codeEl)

      // 创建干净的 pre > code 结构
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      if (language) {
        code.setAttribute('class', `language-${language}`)
      }
      code.textContent = codeText
      pre.appendChild(code)

      // 替换原始代码块
      block.replaceWith(pre)
    }
  })
  console.log(`   代码块处理: ${codeBlocks.length} 个`)

  // 2.3 处理 Tab 容器 - 只保留当前活跃的 Tab 内容
  const tabContainers = document.querySelectorAll('.tabs, [class*="tab-container"]')
  tabContainers.forEach(container => {
    // 找到活跃的 tab panel
    const activePanel = container.querySelector('[role="tabpanel"]:not(.hidden)')
    if (activePanel) {
      // 用 panel 内容替换整个 tab 容器
      const div = document.createElement('div')
      div.innerHTML = activePanel.innerHTML
      container.replaceWith(div)
    }
  })
  console.log(`   Tab 容器处理: ${tabContainers.length} 个`)

  // 2.4 处理卡片链接 - 简化嵌套结构
  // 卡片链接通常包含: a > div > div(icon) + div(content) > h2 + p
  const cardLinks = document.querySelectorAll('a[href]')
  let cardCount = 0
  cardLinks.forEach(link => {
    // 检查是否是卡片链接（包含 h2 或 h3）
    const heading = link.querySelector('h2, h3')
    const description = link.querySelector('p')

    if (heading && description) {
      // 获取内容
      const headingText = heading.textContent?.trim() || ''
      const descText = description.textContent?.trim() || ''
      const href = link.getAttribute('href') || ''
      const target = link.getAttribute('target')
      const rel = link.getAttribute('rel')

      // 创建简化的卡片结构
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
      cardCount++
    }
  })
  console.log(`   卡片链接简化: ${cardCount} 个`)

  // 3. 清理所有元素的属性
  console.log('\n🧼 步骤 3: 清理属性...')
  const allElements = document.querySelectorAll('*')
  let attrRemovedCount = 0

  allElements.forEach(el => {
    const tagName = el.tagName.toLowerCase()

    // 获取该标签允许的属性
    const allowedForTag = ALLOWED_ATTRIBUTES[tagName] || new Set()
    const allowedGlobal = ALLOWED_ATTRIBUTES['*'] || new Set()
    const allowed = new Set([...allowedForTag, ...allowedGlobal])

    // 移除不在白名单的属性
    const attrs = Array.from(el.attributes)
    for (const attr of attrs) {
      if (!allowed.has(attr.name)) {
        el.removeAttribute(attr.name)
        attrRemovedCount++
      }
    }
  })
  console.log(`   移除属性: ${attrRemovedCount} 个`)

  // 4. 移除空元素和纯装饰性 div
  console.log('\n🗑️ 步骤 4: 移除空元素...')
  let emptyRemoved = 0
  const removeEmpty = () => {
    const emptyDivs = document.querySelectorAll('div:empty, span:empty')
    emptyDivs.forEach(el => {
      el.remove()
      emptyRemoved++
    })
  }
  // 多次执行以处理嵌套空元素
  for (let i = 0; i < 3; i++) {
    removeEmpty()
  }
  console.log(`   移除空元素: ${emptyRemoved} 个`)

  // 5. 扁平化不必要的嵌套 div
  console.log('\n📦 步骤 5: 扁平化嵌套结构...')
  let flattenCount = 0
  const flattenDivs = () => {
    // 只包含单个子元素的 div，且子元素也是 div
    const nestedDivs = document.querySelectorAll('div > div:only-child')
    nestedDivs.forEach(innerDiv => {
      const parentDiv = innerDiv.parentElement
      if (parentDiv && parentDiv.tagName === 'DIV' && !parentDiv.id) {
        // 用内层 div 的内容替换外层
        parentDiv.innerHTML = innerDiv.innerHTML
        flattenCount++
      }
    })
  }
  for (let i = 0; i < 3; i++) {
    flattenDivs()
  }
  console.log(`   扁平化: ${flattenCount} 次`)

  // 6. 获取最终 HTML
  const result = document.body.innerHTML

  return result
}

/**
 * 从代码元素中提取纯文本
 */
function extractCodeText(codeEl: Element): string {
  // 获取所有 .line 元素，每行一个
  const lines = codeEl.querySelectorAll('.line')
  if (lines.length > 0) {
    return Array.from(lines)
      .map(line => line.textContent || '')
      .join('\n')
  }

  // 如果没有 .line 结构，直接获取文本
  return codeEl.textContent || ''
}

/**
 * 格式化 HTML（美化输出）
 */
function formatHtml(html: string): string {
  // 简单的格式化：在块级元素后添加换行
  return html
    .replace(/>\s+</g, '>\n<')
    .replace(/<\/(h[1-6]|p|ul|ol|li|pre|blockquote|div|section|article)>/g, '</$1>\n')
    .replace(/<(h[1-6]|p|ul|ol|pre|blockquote|div|section|article)/g, '\n<$1')
    .replace(/\n\n+/g, '\n\n')
    .trim()
}

async function main() {
  console.log('='.repeat(60))
  console.log('HTML 净化器测试')
  console.log('='.repeat(60))

  // 读取原始内容
  console.log('\n📄 读取原始 HTML...')
  const rawHtml = readFileSync(join(OUTPUT_DIR, 'test-full-content.html'), 'utf-8')
  console.log(`   原始 HTML 长度: ${rawHtml.length} 字符`)

  const sniPath = join(OUTPUT_DIR, 'test-sanitized-content123.html')
  const sniContent = sanitizeHtml(rawHtml, 'https://code.claude.com/docs/zh-CN')
  writeFileSync(sniPath, sniContent)
  console.log(`   已保存中间净化内容: ${sniPath}`)

  // 净化 HTML
  const sanitizedHtml = sanitizeHtml(rawHtml, 'https://code.claude.com/docs/zh-CN')

  // 格式化
  const formattedHtml = formatHtml(sanitizedHtml)
  console.log(`\n   净化后 HTML 长度: ${formattedHtml.length} 字符`)
  console.log(`   压缩比: ${((1 - formattedHtml.length / rawHtml.length) * 100).toFixed(1)}%`)

  // 保存结果
  const outputPath = join(OUTPUT_DIR, 'test-sanitized-content.html')
  writeFileSync(outputPath, formattedHtml)
  console.log(`\n💾 保存净化后的 HTML: ${outputPath}`)

  // 创建完整的 HTML 文档预览
  const previewHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>净化后的内容预览</title>
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
    pre code {
      background: none;
      padding: 0;
    }
    blockquote {
      border-left: 4px solid #ddd;
      margin: 1em 0;
      padding: 0.5em 1em;
      color: #666;
    }
    img { max-width: 100%; height: auto; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
${formattedHtml}
</body>
</html>
`
  const previewPath = join(OUTPUT_DIR, 'test-sanitized-preview.html')
  writeFileSync(previewPath, previewHtml)
  console.log(`📄 保存预览页面: ${previewPath}`)

  console.log('\n' + '='.repeat(60))
  console.log('✅ HTML 净化完成!')
  console.log('='.repeat(60))
}

main().catch(console.error)
