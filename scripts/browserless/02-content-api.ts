/**
 * Browserless Content API 测试
 *
 * 【功能说明】
 * 使用 Stealth 模式获取页面 HTML 内容
 * 自动绕过反爬虫检测
 *
 * 【运行方式】
 * npx tsx scripts/browserless/02-content-api.ts
 */

import { BrowserlessClient } from './utils/browserless-client'

const client = new BrowserlessClient()

/**
 * 测试 1: 获取静态页面
 */
async function testStaticPage() {
  console.log('\n📄 测试 1: 获取静态页面')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)

  const startTime = Date.now()
  const html = await client.getContent(url, {
    waitUntil: 'domcontentloaded',
    timeout: 10000
  })
  const duration = Date.now() - startTime

  const titleMatch = html.match(/<title>([^<]+)<\/title>/)
  const title = titleMatch ? titleMatch[1] : '(未找到)'

  console.log(`✅ 获取成功`)
  console.log(`   耗时: ${duration}ms`)
  console.log(`   内容长度: ${html.length} 字符`)
  console.log(`   标题: ${title}`)
}

/**
 * 测试 2: 获取有反爬虫的网站（Stealth 模式）
 */
async function testAntiScrapingSite() {
  console.log('\n📄 测试 2: 获取有反爬虫的网站 (Stealth 模式)')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  console.log(`目标 URL: ${url}`)
  console.log(`说明: 此网站会检测自动化工具，使用 Stealth 模式绕过`)

  const startTime = Date.now()
  const html = await client.getContent(url, {
    waitUntil: 'domcontentloaded',
    timeout: 20000
  })
  const duration = Date.now() - startTime

  const titleMatch = html.match(/<title>([^<]+)<\/title>/)
  const title = titleMatch ? titleMatch[1] : '(未找到)'
  const articleCount = (html.match(/class="titleline"/g) || []).length

  console.log(`✅ 获取成功`)
  console.log(`   耗时: ${duration}ms`)
  console.log(`   内容长度: ${html.length} 字符`)
  console.log(`   标题: ${title}`)
  console.log(`   文章数量: ${articleCount} 篇`)
}

/**
 * 测试 3: 对比 Stealth 和非 Stealth 模式
 */
async function testStealthComparison() {
  console.log('\n📄 测试 3: Stealth vs 非 Stealth 模式对比')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  console.log(`目标 URL: ${url}\n`)

  // 非 Stealth 模式（可能失败）
  console.log('  非 Stealth 模式:')
  try {
    const startTime = Date.now()
    const html = await client.getContent(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
      stealth: false  // 禁用 Stealth
    })
    const duration = Date.now() - startTime
    console.log(`    ✅ 成功 (${duration}ms, ${html.length} 字符)`)
  } catch (error) {
    console.log(`    ❌ 失败: ${error instanceof Error ? error.message.substring(0, 50) : '超时'}`)
  }

  // Stealth 模式
  console.log('  Stealth 模式:')
  try {
    const startTime = Date.now()
    const html = await client.getContent(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
      stealth: true  // 启用 Stealth（默认）
    })
    const duration = Date.now() - startTime
    console.log(`    ✅ 成功 (${duration}ms, ${html.length} 字符)`)
  } catch (error) {
    console.log(`    ❌ 失败: ${error instanceof Error ? error.message.substring(0, 50) : '超时'}`)
  }
}

/**
 * 测试 4: 不同 waitUntil 选项
 */
async function testWaitUntilOptions() {
  console.log('\n📄 测试 4: waitUntil 选项对比')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  const options: Array<'domcontentloaded' | 'load' | 'networkidle2'> = [
    'domcontentloaded',
    'load',
    'networkidle2'
  ]

  console.log(`目标 URL: ${url}\n`)

  for (const waitUntil of options) {
    const startTime = Date.now()
    const html = await client.getContent(url, { waitUntil, timeout: 15000 })
    const duration = Date.now() - startTime
    console.log(`  ${waitUntil.padEnd(18)} | ${duration}ms | ${html.length} 字符`)
  }

  console.log('\n说明:')
  console.log('  - domcontentloaded: DOM 解析完成（最快）')
  console.log('  - load: 页面 load 事件触发')
  console.log('  - networkidle2: 网络基本空闲（最完整）')
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60))
  console.log('Browserless Content API 测试 (Stealth 模式)')
  console.log('='.repeat(60))

  try {
    await testStaticPage()
    await testAntiScrapingSite()
    await testStealthComparison()
    await testWaitUntilOptions()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 所有测试完成')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    process.exit(1)
  }
}

main()
