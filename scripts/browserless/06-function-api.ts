/**
 * Browserless Function API 测试
 *
 * 【功能说明】
 * 使用 Stealth 模式执行自定义 Puppeteer 代码
 * 适合复杂的页面交互和自定义逻辑
 *
 * 【运行方式】
 * npx tsx scripts/browserless/06-function-api.ts
 */

import { BrowserlessClient } from './utils/browserless-client'

const client = new BrowserlessClient()

/**
 * 测试 1: 获取页面标题
 */
async function testGetTitle() {
  console.log('\n🔧 测试 1: 获取页面标题')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)

  const result = await client.execute<{ title: string }>(url, `
    const title = await page.title();
    return { data: { title }, type: 'application/json' };
  `)

  console.log(`✅ 执行成功`)
  console.log(`   标题: ${result.title}`)
}

/**
 * 测试 2: 抓取有反爬虫网站（Stealth 模式）
 */
async function testAntiScrapingSite() {
  console.log('\n🔧 测试 2: 抓取有反爬虫网站 (Stealth 模式)')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  console.log(`目标 URL: ${url}`)

  const result = await client.execute<{ title: string; articleCount: number }>(url, `
    const title = await page.title();
    const articles = await page.$$('.titleline > a');
    return {
      data: { title, articleCount: articles.length },
      type: 'application/json'
    };
  `, { timeout: 20000 })

  console.log(`✅ 执行成功`)
  console.log(`   标题: ${result.title}`)
  console.log(`   文章数量: ${result.articleCount}`)
}

/**
 * 测试 3: 页面交互 - 点击和等待
 */
async function testPageInteraction() {
  console.log('\n🔧 测试 3: 页面交互')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)

  const result = await client.execute<{ linkText: string; href: string }>(url, `
    // 获取页面上的链接
    const link = await page.$('a');
    if (link) {
      const linkText = await link.evaluate(el => el.textContent);
      const href = await link.evaluate(el => el.href);
      return { data: { linkText, href }, type: 'application/json' };
    }
    return { data: { linkText: '(无)', href: '(无)' }, type: 'application/json' };
  `)

  console.log(`✅ 执行成功`)
  console.log(`   链接文本: ${result.linkText}`)
  console.log(`   链接地址: ${result.href}`)
}

/**
 * 测试 4: 检测浏览器指纹（验证 Stealth）
 */
async function testStealthFingerprint() {
  console.log('\n🔧 测试 4: 验证 Stealth 模式生效')
  console.log('-'.repeat(40))

  const url = 'about:blank'

  const result = await client.execute<{ webdriver: boolean; userAgent: string }>(url, `
    const fingerprint = await page.evaluate(() => ({
      webdriver: navigator.webdriver,
      userAgent: navigator.userAgent
    }));
    return { data: fingerprint, type: 'application/json' };
  `)

  console.log(`检测结果:`)
  console.log(`  webdriver: ${result.webdriver} ${result.webdriver ? '🚨 暴露!' : '✅ 隐藏'}`)
  console.log(`  userAgent: ${result.userAgent.includes('Headless') ? '🚨 包含 Headless!' : '✅ 正常'}`)
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60))
  console.log('Browserless Function API 测试 (Stealth 模式)')
  console.log('='.repeat(60))

  try {
    await testGetTitle()
    await testAntiScrapingSite()
    await testPageInteraction()
    await testStealthFingerprint()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 所有测试完成')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    process.exit(1)
  }
}

main()
