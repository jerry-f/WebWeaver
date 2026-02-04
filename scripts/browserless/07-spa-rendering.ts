/**
 * Browserless SPA 渲染测试
 *
 * 【功能说明】
 * 测试 Stealth 模式对 SPA 页面的渲染能力
 *
 * 【运行方式】
 * npx tsx scripts/browserless/07-spa-rendering.ts
 */

import { BrowserlessClient } from './utils/browserless-client'

const client = new BrowserlessClient()

/**
 * 测试 1: HTTP vs Browserless 对比
 */
async function testComparison() {
  console.log('\n🌐 测试 1: HTTP vs Browserless 对比')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}\n`)

  // HTTP 请求
  const httpStart = Date.now()
  const httpResp = await fetch(url)
  const httpHtml = await httpResp.text()
  console.log(`  HTTP:        ${Date.now() - httpStart}ms | ${httpHtml.length} 字符`)

  // Browserless
  const blStart = Date.now()
  const blHtml = await client.getContent(url, { waitUntil: 'domcontentloaded' })
  console.log(`  Browserless: ${Date.now() - blStart}ms | ${blHtml.length} 字符`)
}

/**
 * 测试 2: SPA 动态内容渲染（InfoQ 中国）
 * InfoQ 是典型的 SPA 单页面应用，首屏内容由 JavaScript 动态生成
 */
async function testDynamicContent() {
  console.log('\n🌐 测试 2: SPA 动态内容渲染 (InfoQ 中国)')
  console.log('-'.repeat(40))

  const url = 'https://www.infoq.cn/'
  console.log(`目标 URL: ${url}`)
  console.log('说明: InfoQ 是典型的 SPA 应用，内容由 JavaScript 动态渲染\n')

  // 先用 HTTP 获取（只能拿到空壳）
  console.log('HTTP 请求（不执行 JS）:')
  const httpStart = Date.now()
  const httpResp = await fetch(url)
  const httpHtml = await httpResp.text()
  const httpArticles = (httpHtml.match(/article-item/gi) || []).length
  console.log(`  耗时: ${Date.now() - httpStart}ms | 内容: ${httpHtml.length} 字符 | 文章: ${httpArticles} 篇`)

  // 再用 Browserless 获取（渲染后的完整内容）
  console.log('\nBrowserless 请求（执行 JS 渲染）:')
  const startTime = Date.now()
  const html = await client.getContent(url, { waitUntil: 'networkidle2', timeout: 30000 })
  const duration = Date.now() - startTime

  // 统计渲染后的文章数量
  const articleCount = (html.match(/article-item|com-article-card/gi) || []).length
  const titleCount = (html.match(/<a[^>]*class="[^"]*title[^"]*"[^>]*>/gi) || []).length

  console.log(`  耗时: ${duration}ms | 内容: ${html.length} 字符 | 文章元素: ${articleCount} 个`)

  console.log('\n📊 对比结论:')
  console.log(`  HTTP:        ${httpHtml.length} 字符 (空壳，无实际内容)`)
  console.log(`  Browserless: ${html.length} 字符 (完整渲染后的页面)`)
  console.log(`  增量:        ${html.length - httpHtml.length} 字符 (由 JS 动态生成)`)
}

/**
 * 测试 3: waitUntil 选项对比
 */
async function testWaitUntil() {
  console.log('\n🌐 测试 3: waitUntil 选项对比')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  const options: Array<'domcontentloaded' | 'load' | 'networkidle2'> = [
    'domcontentloaded', 'load', 'networkidle2'
  ]

  console.log(`目标 URL: ${url}\n`)

  for (const waitUntil of options) {
    const start = Date.now()
    const html = await client.getContent(url, { waitUntil, timeout: 15000 })
    console.log(`  ${waitUntil.padEnd(18)} | ${Date.now() - start}ms | ${html.length} 字符`)
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('Browserless SPA 渲染测试 (Stealth 模式)')
  console.log('='.repeat(60))

  try {
    await testComparison()
    await testDynamicContent()
    await testWaitUntil()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 所有测试完成')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    process.exit(1)
  }
}

main()
