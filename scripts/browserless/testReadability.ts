/**
 * 测试 Readability 内容提取优化方案
 *
 * 【核心思路】
 * Readability 会过滤掉"杂乱"内容（如导航卡片），但它能准确识别内容区域的根元素。
 * 我们利用这一点：
 * 1. 用 Readability 识别内容根元素
 * 2. 从 article.content 中提取根元素的选择器（id/class）
 * 3. 用选择器在源 DOM 中查找，获取未过滤的完整内容
 *
 * 【运行方式】
 * npx tsx scripts/browserless/testReadability.ts
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

const OUTPUT_DIR = join(process.cwd(), 'scripts/browserless/output')

// 确保输出目录存在
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

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
 * 从 Readability 提取的内容中获取根元素选择器
 *
 * @param contentHtml - Readability 返回的 content HTML
 * @returns 选择器字符串或 null
 */
function extractRootSelector(contentHtml: string): string | null {
  // 解析 Readability 返回的 HTML
  const dom = new JSDOM(contentHtml)
  const doc = dom.window.document

  // Readability 会包装一个 div#readability-page-1，真正的根元素是它的第一个子元素
  const wrapper = doc.querySelector('#readability-page-1')
  const rootElement = wrapper?.firstElementChild || doc.body.firstElementChild

  if (!rootElement) return null

  // 优先使用 id 选择器
  const id = rootElement.getAttribute('id')
  if (id && id !== 'readability-page-1') {
    console.log(`   找到根元素 ID: #${id}`)
    return `#${id}`
  }

  // 其次使用特征 class
  const classList = rootElement.getAttribute('class')
  if (classList) {
    // 取第一个有意义的 class（避免通用 class 如 'page', 'content'）
    const classes = classList.split(/\s+/).filter(c =>
      c.length > 3 &&
      !['page', 'content', 'main', 'wrapper', 'container'].includes(c)
    )
    if (classes.length > 0) {
      console.log(`   找到根元素 class: .${classes[0]}`)
      return `.${classes[0]}`
    }
  }

  // 使用 data 属性
  const dataAttrs = Array.from(rootElement.attributes)
    .filter(attr => attr.name.startsWith('data-') && attr.value)
  if (dataAttrs.length > 0) {
    const selector = `[${dataAttrs[0].name}="${dataAttrs[0].value}"]`
    console.log(`   找到根元素 data 属性: ${selector}`)
    return selector
  }

  return null
}

async function main() {
  console.log('='.repeat(60))
  console.log('测试 Readability 内容提取优化方案')
  console.log('='.repeat(60))

  const url = 'https://code.claude.com/docs/zh-CN'
  console.log(`\n目标 URL: ${url}`)
  const startTime = Date.now()

  // 1. 读取源 HTML
  console.log('\n📄 步骤 1: 读取源 HTML...')
  const html = readFileSync(join(OUTPUT_DIR, '12-raw-html.html'), 'utf-8')
  console.log(`   HTML 长度: ${html.length} 字符`)

  // 2. 创建两个 DOM：一个给 Readability 分析，一个保留原始内容
  console.log('\n🔧 步骤 2: 准备 DOM...')
  const sourceDom = new JSDOM(html, { url })
  const sourceDoc = sourceDom.window.document

  // 克隆一份给 Readability（它会修改 DOM）
  const clonedHtml = html
  const readabilityDom = new JSDOM(clonedHtml, { url })
  const readabilityDoc = readabilityDom.window.document

  // 处理懒加载图片（两个 DOM 都处理）
  for (const doc of [sourceDoc, readabilityDoc]) {
    const imgElements = doc.querySelectorAll('img')
    imgElements.forEach((img) => {
      for (const attr of LAZY_ATTRIBUTES) {
        const lazySrc = img.getAttribute(attr)
        if (lazySrc && (lazySrc.startsWith('http') || lazySrc.startsWith('/'))) {
          img.setAttribute('src', lazySrc)
          break
        }
      }
    })
  }

  // 3. 使用 Readability 分析（识别内容区域）
  console.log('\n📖 步骤 3: Readability 分析内容区域...')
  const reader = new Readability(readabilityDoc, {
    charThreshold: 0,
    nbTopCandidates: 10,
    keepClasses: true,
  })
  const article = reader.parse()

  if (!article || !article.content) {
    console.error('   ❌ Readability 无法识别内容区域')
    return
  }

  console.log(`   ✅ Readability 识别成功`)
  console.log(`   标题: ${article.title}`)
  console.log(`   Readability 提取的内容长度: ${article.content.length} 字符`)

  // 保存 Readability 提取的内容（用于对比）
  const readabilityPath = join(OUTPUT_DIR, 'test-readability-content.html')
  writeFileSync(readabilityPath, article.content)
  console.log(`   保存 Readability 内容: ${readabilityPath}`)

  // 4. 从 Readability 内容中提取根元素选择器
  console.log('\n🔍 步骤 4: 提取根元素选择器...')
  const rootSelector = extractRootSelector(article.content)

  if (!rootSelector) {
    console.error('   ❌ 无法提取根元素选择器')
    return
  }

  // 5. 用选择器在源 DOM 中查找完整内容
  console.log('\n🎯 步骤 5: 从源 DOM 获取完整内容...')
  const originalRoot = sourceDoc.querySelector(rootSelector)

  if (!originalRoot) {
    console.error(`   ❌ 在源 DOM 中找不到元素: ${rootSelector}`)
    return
  }

  const fullContent = originalRoot.innerHTML
  console.log(`   ✅ 找到完整内容!`)
  console.log(`   完整内容长度: ${fullContent.length} 字符`)
  console.log(`   内容增加: ${fullContent.length - article.content.length} 字符 (+${((fullContent.length / article.content.length - 1) * 100).toFixed(1)}%)`)

  // 保存完整内容
  const fullContentPath = join(OUTPUT_DIR, 'test-full-content.html')
  writeFileSync(fullContentPath, fullContent)
  console.log(`   保存完整内容: ${fullContentPath}`)

  // 6. 对比统计
  const duration = Date.now() - startTime
  console.log('\n' + '='.repeat(60))
  console.log('📊 对比结果')
  console.log('='.repeat(60))
  console.log(`   Readability 内容: ${article.content.length} 字符`)
  console.log(`   完整内容: ${fullContent.length} 字符`)
  console.log(`   标题: ${article.title}`)
  console.log(`   耗时: ${duration}ms`)
  console.log(`\n   Readability 内容: ${readabilityPath}`)
  console.log(`   完整内容: ${fullContentPath}`)
}

main().catch(console.error)
