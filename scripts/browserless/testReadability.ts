/**
 * 测试 code.claude.com 网站抓取（完整流程）
 *
 * 【功能说明】
 * 完整测试 Browserless 抓取流程：
 * 1. 获取 HTML
 * 2. 懒加载图片处理
 * 3. Readability 正文提取
 * 4. 图片处理
 * 5. HTML 净化
 *
 * 【运行方式】
 * npx tsx scripts/browserless/12-test-claude-docs.ts
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
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
  'data-echo'
]

async function main() {
  console.log('='.repeat(60))
  console.log('测试 html 解析（完整流程）')
  console.log('='.repeat(60))

  const url = 'https://code.claude.com/docs/zh-CN'
  console.log(`\n目标 URL: ${url}`)
  const startTime = Date.now()


  // 3. 获取页面 HTML
  console.log('\n🌐 步骤 3: 获取页面 HTML...')

  let html = readFileSync(join(OUTPUT_DIR, '12-raw-html.html'), 'utf-8')

  // 3. 解析 HTML 并处理懒加载图片
  console.log('\n🔧 步骤 4: 解析 HTML 并处理懒加载图片...')
  const dom = new JSDOM(html, { url })
  const document = dom.window.document

  // 处理懒加载图片
  const imgElements = document.querySelectorAll('img')
  let lazyImgCount = 0
  imgElements.forEach((img) => {
    for (const attr of LAZY_ATTRIBUTES) {
      const lazySrc = img.getAttribute(attr)
      if (lazySrc && (lazySrc.startsWith('http') || lazySrc.startsWith('/'))) {
        img.setAttribute('src', lazySrc)
        lazyImgCount++
        break
      }
    }
    const dataSrcset = img.getAttribute('data-srcset')
    if (dataSrcset) {
      img.setAttribute('srcset', dataSrcset)
    }
  })
  console.log(`   图片总数: ${imgElements.length}`)
  console.log(`   懒加载图片处理: ${lazyImgCount}`)

  // 4. 使用 Readability 提取正文（带优化参数）
  console.log('\n📖 步骤 5: 使用 Readability 提取正文...')

  // Readability 配置选项说明：
  // - charThreshold: 最小字符阈值，默认500，降低可以保留更多内容
  // - nbTopCandidates: 候选元素数量，默认5，增加可以考虑更多内容块
  // - keepClasses: 保留 CSS 类名，便于后续样式处理
  // - classesToPreserve: 指定要保留的类名列表
  const reader = new Readability(document, {
    charThreshold: 0,           // 设为0，不过滤短内容
    nbTopCandidates: 10,        // 增加候选数量
    keepClasses: true,          // 保留类名
    debug: false,               // 调试模式
  })
  const article = reader.parse()
  console.log('   正文提取结果:', article)

  if (!article || !article.content) {
    console.error('   ❌ Readability 提取失败：无法解析正文')
    console.log('\n🔍 调试信息:')
    console.log(`   页面标题: ${document.title}`)
    console.log(`   body 长度: ${document.body?.innerHTML?.length || 0}`)

    // 尝试手动查找内容区域
    const mainContent = document.querySelector('main') || document.querySelector('article') || document.querySelector('.content')
    if (mainContent) {
      console.log(`   找到内容区域: ${mainContent.tagName}, 长度: ${mainContent.innerHTML.length}`)

      // 保存内容区域
      const mainHtmlPath = join(OUTPUT_DIR, '12-main-content.html')
      writeFileSync(mainHtmlPath, mainContent.innerHTML)
      console.log(`   保存内容区域: ${mainHtmlPath}`)
    }
    return
  }

  console.log(`   ✅ 提取成功!`)
  console.log(`   标题: ${article.title}`)
  console.log(`   作者: ${article.byline || '未知'}`)
  console.log(`   站点: ${article.siteName || '未知'}`)
  console.log(`   摘要: ${article.excerpt?.substring(0, 100)}...`)
  console.log(`   正文长度: ${article.textContent?.length || 0} 字符`)
  console.log(`   HTML 长度: ${article.content.length} 字符`)

  // 5. 保存结果
  console.log('\n💾 步骤 6: 保存结果...')

  // 保存提取的 HTML
  const contentHtmlPath = join(OUTPUT_DIR, '12-extracted-content.html')
  const fullHtml = `
<!DOCTYPE html>
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
    h1 { color: #1a1a1a; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 20px; }
    .excerpt { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    img { max-width: 100%; height: auto; }
    pre { background: #f5f5f5; padding: 15px; overflow-x: auto; border-radius: 5px; }
    code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; }
    pre code { background: none; padding: 0; }
  </style>
</head>
<body>
  <h1>${article.title || 'Untitled'}</h1>
  <div class="meta">
    ${article.byline ? `<span>作者: ${article.byline}</span> | ` : ''}
    ${article.siteName ? `<span>来源: ${article.siteName}</span>` : ''}
  </div>
  ${article.excerpt ? `<div class="excerpt">${article.excerpt}</div>` : ''}
  <div class="content">
    ${article.content}
  </div>
</body>
</html>
`
  writeFileSync(contentHtmlPath, fullHtml)
  console.log(`   提取的 HTML: ${contentHtmlPath}`)

  // 保存纯文本
  const textPath = join(OUTPUT_DIR, '12-extracted-text.txt')
  writeFileSync(textPath, article.textContent || '')
  console.log(`   纯文本: ${textPath}`)

  // 6. 输出总结
  const duration = Date.now() - startTime
  console.log('\n' + '='.repeat(60))
  console.log('✅ 完整抓取流程完成!')
  console.log('='.repeat(60))
  console.log(`   总耗时: ${duration}ms`)
  console.log(`   标题: ${article.title}`)
  console.log(`   正文: ${article.textContent?.length || 0} 字符`)
  console.log(`\n   查看提取结果: ${contentHtmlPath}`)
}

main().catch(console.error)
