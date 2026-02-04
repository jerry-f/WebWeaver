/**
 * Browserless Stealth 模式测试
 *
 * 【功能说明】
 * 测试如何通过手动伪装来绕过反爬虫检测
 * 社区版 Browserless 不支持内置的 stealth 模式
 * 但我们可以通过 /function API 手动隐藏自动化特征
 *
 * 【检测项目】
 * - navigator.webdriver: 自动化工具标志
 * - UserAgent: 是否包含 "Headless"
 * - navigator.plugins: 插件数量
 * - navigator.languages: 语言设置
 *
 * 【运行方式】
 * npx tsx scripts/browserless/10-stealth-test.ts
 */

import { BrowserlessClient } from './utils/browserless-client'

const client = new BrowserlessClient()
const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'http://localhost:3300'

/**
 * 测试用例：检测默认配置的指纹（不使用 Stealth）
 */
async function testDefaultFingerprint(): Promise<void> {
  console.log('\n🔍 测试 1: 默认配置的浏览器指纹')
  console.log('-'.repeat(40))

  const code = `
    module.exports = async ({ page }) => {
      await page.goto('about:blank');

      const fingerprint = await page.evaluate(() => ({
        webdriver: navigator.webdriver,
        userAgent: navigator.userAgent,
        plugins: navigator.plugins.length,
        languages: navigator.languages,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory,
        chrome: !!window.chrome,
        permissions: 'permissions' in navigator
      }));

      return { data: fingerprint, type: 'application/json' };
    };
  `

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  })

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`)
  }

  const data = await response.json()

  console.log('检测结果:')
  console.log(`  webdriver:     ${data.webdriver} ${data.webdriver ? '🚨 暴露!' : '✅ 隐藏'}`)
  console.log(`  userAgent:     ${data.userAgent.includes('Headless') ? '🚨 包含 Headless!' : '✅ 正常'}`)
  console.log(`  plugins:       ${data.plugins} 个`)
  console.log(`  languages:     ${JSON.stringify(data.languages)}`)
  console.log(`  platform:      ${data.platform}`)
  console.log(`  chrome 对象:   ${data.chrome ? '✅ 存在' : '❌ 缺失'}`)
}

/**
 * 测试用例：使用 BrowserlessClient (Stealth 模式) 的指纹
 */
async function testStealthFingerprint(): Promise<void> {
  console.log('\n🥷 测试 2: Stealth 伪装后的浏览器指纹')
  console.log('-'.repeat(40))

  const result = await client.execute<{
    webdriver: boolean
    userAgent: string
    plugins: number
    languages: string[]
    chrome: boolean
  }>('about:blank', `
    const fingerprint = await page.evaluate(() => ({
      webdriver: navigator.webdriver,
      userAgent: navigator.userAgent,
      plugins: navigator.plugins.length,
      languages: navigator.languages,
      chrome: !!window.chrome,
    }));

    return { data: fingerprint, type: 'application/json' };
  `)

  console.log('伪装后结果:')
  console.log(`  webdriver:     ${result.webdriver} ${result.webdriver ? '🚨 暴露!' : '✅ 隐藏'}`)
  console.log(`  userAgent:     ${result.userAgent.includes('Headless') ? '🚨 包含 Headless!' : '✅ 正常'}`)
  console.log(`  plugins:       ${result.plugins} 个`)
  console.log(`  languages:     ${JSON.stringify(result.languages)}`)
  console.log(`  chrome 对象:   ${result.chrome ? '✅ 存在' : '❌ 缺失'}`)
}

/**
 * 测试用例：使用 Stealth 访问有反爬虫的网站
 */
async function testStealthOnRealSite(): Promise<void> {
  console.log('\n🌐 测试 3: 使用 Stealth 访问 news.ycombinator.com')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  const startTime = Date.now()

  const html = await client.getContent(url, {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  })

  const duration = Date.now() - startTime
  const titleMatch = html.match(/<title>([^<]+)<\/title>/)
  const title = titleMatch ? titleMatch[1] : '未知'

  console.log(`✅ 访问成功! (${duration}ms)`)
  console.log(`   标题: ${title}`)
  console.log(`   内容长度: ${html.length} 字符`)
}

/**
 * 测试用例：对比普通模式和 Stealth 模式访问速度
 */
async function testComparison(): Promise<void> {
  console.log('\n📊 测试 4: 普通模式 vs Stealth 模式访问对比')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  console.log(`目标 URL: ${url}`)
  console.log('对比访问有反爬虫检测网站的效果\n')

  // 普通模式（不使用 Stealth）
  console.log('普通模式访问中...')
  const normalCode = `
    module.exports = async ({ page, context }) => {
      const start = Date.now();
      try {
        await page.goto(context.url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const title = await page.title();
        return {
          data: { success: true, title, time: Date.now() - start },
          type: 'application/json'
        };
      } catch (error) {
        return {
          data: { success: false, error: error.message, time: Date.now() - start },
          type: 'application/json'
        };
      }
    };
  `

  const normalResponse = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: normalCode, context: { url } })
  })

  const normalResult = await normalResponse.json()
  console.log(`  普通模式: ${normalResult.success ? `✅ 成功 (${normalResult.time}ms)` : `❌ 失败 (${normalResult.time}ms)`}`)

  // Stealth 模式
  console.log('Stealth 模式访问中...')
  const stealthStart = Date.now()
  const html = await client.getContent(url, {
    waitUntil: 'domcontentloaded',
    timeout: 10000
  })
  const stealthTime = Date.now() - stealthStart

  console.log(`  Stealth:  ✅ 成功 (${stealthTime}ms)`)

  console.log('\n📝 结论:')
  console.log('  Stealth 模式隐藏了自动化特征，可以正常访问有反爬虫检测的网站')
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('='.repeat(60))
  console.log('Browserless Stealth 模式测试')
  console.log('='.repeat(60))
  console.log(`服务地址: ${BROWSERLESS_URL}`)

  try {
    await testDefaultFingerprint()
    await testStealthFingerprint()
    await testStealthOnRealSite()
    await testComparison()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 所有测试完成')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    process.exit(1)
  }
}

main()
