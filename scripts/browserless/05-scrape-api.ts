/**
 * Browserless Scrape API 测试
 *
 * 【功能说明】
 * 使用 Stealth 模式通过 CSS 选择器提取页面内容
 * 自动绕过反爬虫检测
 *
 * 【运行方式】
 * npx tsx scripts/browserless/05-scrape-api.ts
 */

import { BrowserlessClient } from './utils/browserless-client'

const client = new BrowserlessClient()

/**
 * 测试 1: 提取页面标题和段落
 */
async function testBasicScrape() {
  console.log('\n🔍 测试 1: 提取页面标题和段落')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)
  console.log(`选择器: h1, p`)

  const startTime = Date.now()
  const results = await client.scrape(url, {
    selectors: ['h1', 'p'],
    waitUntil: 'domcontentloaded',
    timeout: 10000
  })
  const duration = Date.now() - startTime

  console.log(`\n✅ 提取成功 (${duration}ms)\n`)

  for (const item of results) {
    console.log(`选择器: ${item.selector}`)
    console.log(`  匹配数量: ${item.results.length}`)
    for (const result of item.results.slice(0, 3)) {
      const text = result.text.substring(0, 50)
      console.log(`  - "${text}${result.text.length > 50 ? '...' : ''}"`)
    }
    console.log('')
  }
}

/**
 * 测试 2: 抓取有反爬虫网站（Stealth 模式）
 */
async function testAntiScrapingSite() {
  console.log('\n🔍 测试 2: 抓取有反爬虫的网站 (Stealth 模式)')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  console.log(`目标 URL: ${url}`)
  console.log(`选择器: .titleline > a`)
  console.log(`说明: 此网站会检测自动化工具，使用 Stealth 模式绕过`)

  const startTime = Date.now()
  const results = await client.scrape(url, {
    selectors: ['.titleline > a'],
    waitUntil: 'domcontentloaded',
    timeout: 20000
  })
  const duration = Date.now() - startTime

  const titles = results[0]?.results || []

  console.log(`\n✅ 提取成功 (${duration}ms)`)
  console.log(`   文章数量: ${titles.length}\n`)

  console.log('前 10 篇文章:')
  for (const [index, item] of titles.slice(0, 10).entries()) {
    const title = item.text.substring(0, 50)
    const href = item.attributes.href || ''
    console.log(`  ${(index + 1).toString().padStart(2)}. ${title}`)
    console.log(`      ${href.substring(0, 60)}${href.length > 60 ? '...' : ''}`)
  }
}

/**
 * 测试 3: 提取多种元素
 */
async function testMultipleSelectors() {
  console.log('\n🔍 测试 3: 提取多种元素')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)

  const results = await client.scrape(url, {
    selectors: ['title', 'h1', 'a'],
    waitUntil: 'domcontentloaded',
    timeout: 10000
  })

  console.log(`\n✅ 提取成功\n`)

  for (const item of results) {
    console.log(`选择器: ${item.selector}`)
    console.log(`  匹配数量: ${item.results.length}`)

    if (item.selector === 'title') {
      console.log(`  标题: ${item.results[0]?.text || '(无)'}`)
    } else if (item.selector === 'a') {
      console.log(`  链接:`)
      for (const link of item.results.slice(0, 3)) {
        console.log(`    - ${link.text}: ${link.attributes.href || '(无)'}`)
      }
    } else {
      for (const result of item.results.slice(0, 2)) {
        console.log(`  - ${result.text.substring(0, 40)}`)
      }
    }
    console.log('')
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60))
  console.log('Browserless Scrape API 测试 (Stealth 模式)')
  console.log('='.repeat(60))

  try {
    await testBasicScrape()
    await testAntiScrapingSite()
    await testMultipleSelectors()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 所有测试完成')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    process.exit(1)
  }
}

main()
