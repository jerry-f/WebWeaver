/**
 * Browserless SPA 渲染测试
 *
 * 【功能说明】
 * 测试 Browserless 对 SPA（单页应用）和 CSR（客户端渲染）页面的处理能力
 * 这是 Browserless 最重要的应用场景之一
 *
 * 【什么是 SPA/CSR？】
 * - SPA: 单页应用，如 React、Vue、Angular 构建的应用
 * - CSR: 客户端渲染，页面内容由 JavaScript 动态生成
 * - 特点: 初始 HTML 几乎为空，内容通过 JS 加载后渲染
 *
 * 【为什么需要 Browserless？】
 * 传统的 HTTP 请求只能获取初始 HTML，无法执行 JavaScript
 * Browserless 会像真实浏览器一样执行 JS，等待内容渲染完成
 *
 * 【使用场景】
 * - 抓取 React/Vue/Angular 应用
 * - 获取 AJAX 加载的内容
 * - 处理需要用户交互才显示的内容
 *
 * 【运行方式】
 * npx tsx scripts/browserless/07-spa-rendering.ts
 */

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'http://localhost:3300'

/**
 * 对比测试结果
 */
interface ComparisonResult {
  url: string
  httpFetch: {
    success: boolean
    contentLength: number
    hasContent: boolean
    sampleText: string
  }
  browserless: {
    success: boolean
    contentLength: number
    hasContent: boolean
    sampleText: string
  }
  difference: string
}

/**
 * 测试用例：对比静态页面抓取
 *
 * 静态页面使用 HTTP 和 Browserless 结果应该相似
 */
async function testStaticPage(): Promise<void> {
  console.log('\n🌐 测试 1: 静态页面对比')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)
  console.log('期望: HTTP 请求和 Browserless 结果相似')

  const result = await compareResults(url)
  printComparison(result)
}

/**
 * 测试用例：对比 SPA 页面抓取
 *
 * SPA 页面使用 HTTP 只能获取空壳，Browserless 可以获取完整内容
 */
async function testSpaPage(): Promise<void> {
  console.log('\n🌐 测试 2: SPA 页面对比 (GitHub)')
  console.log('-'.repeat(40))

  const url = 'https://github.com/explore'
  console.log(`目标 URL: ${url}`)
  console.log('期望: Browserless 获取到更多动态加载的内容')

  const result = await compareResults(url)
  printComparison(result)
}

/**
 * 测试用例：抓取 React 应用
 */
async function testReactApp(): Promise<void> {
  console.log('\n🌐 测试 3: React 应用')
  console.log('-'.repeat(40))

  // React 官网是用 Next.js 构建的
  const url = 'https://react.dev'
  console.log(`目标 URL: ${url}`)

  const result = await compareResults(url)
  printComparison(result)
}

/**
 * 测试用例：等待特定元素渲染
 *
 * 某些 SPA 页面需要等待特定元素加载
 */
async function testWaitForElement(): Promise<void> {
  console.log('\n🌐 测试 4: 等待特定元素')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  const selector = '.titleline'
  console.log(`目标 URL: ${url}`)
  console.log(`等待元素: ${selector}`)

  const startTime = Date.now()

  const response = await fetch(`${BROWSERLESS_URL}/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      gotoOptions: {
        waitUntil: 'networkidle2',
        timeout: 30000
      },
      waitForSelector: {
        selector,
        timeout: 10000
      }
    })
  })

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`)
  }

  const html = await response.text()
  const duration = Date.now() - startTime

  // 检查目标元素是否存在
  const elementCount = (html.match(new RegExp(selector.replace('.', '\\.'), 'g')) || []).length
  const titleMatches = html.match(/<span class="titleline">/g) || []

  console.log(`\n✅ 渲染成功 (${duration}ms)`)
  console.log(`   内容长度: ${html.length} 字符`)
  console.log(`   找到 ${selector}: ${titleMatches.length} 个`)
}

/**
 * 测试用例：处理 AJAX 加载的内容
 */
async function testAjaxContent(): Promise<void> {
  console.log('\n🌐 测试 5: AJAX 动态加载')
  console.log('-'.repeat(40))

  const url = 'https://api.github.com'
  console.log(`目标 URL: ${url}`)
  console.log('说明: GitHub API 页面会动态加载内容')

  // 使用 Function API 来更好地控制等待
  const code = `
    module.exports = async ({ page, context }) => {
      const { url } = context;

      await page.goto(url, { waitUntil: 'networkidle2' });

      // 等待页面内容稳定
      await new Promise(r => setTimeout(r, 1000));

      const content = await page.evaluate(() => {
        return {
          bodyText: document.body.innerText,
          hasPreElement: !!document.querySelector('pre'),
          preContent: document.querySelector('pre')?.textContent?.substring(0, 200) || ''
        };
      });

      return {
        data: content,
        type: 'application/json'
      };
    };
  `

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, context: { url } })
  })

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`)
  }

  const result = await response.json()

  console.log(`\n✅ 获取成功`)
  console.log(`   包含 <pre> 元素: ${result.hasPreElement ? '是' : '否'}`)
  console.log(`   内容预览: ${result.preContent?.substring(0, 100)}...`)
}

/**
 * 测试用例：不同 waitUntil 对 SPA 的影响
 */
async function testWaitUntilImpact(): Promise<void> {
  console.log('\n🌐 测试 6: waitUntil 对 SPA 渲染的影响')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  const options: Array<{ name: string; waitUntil: string }> = [
    { name: 'domcontentloaded', waitUntil: 'domcontentloaded' },
    { name: 'load', waitUntil: 'load' },
    { name: 'networkidle2', waitUntil: 'networkidle2' }
  ]

  console.log(`目标 URL: ${url}\n`)
  console.log('对比不同 waitUntil 选项:\n')

  for (const opt of options) {
    const startTime = Date.now()

    const response = await fetch(`${BROWSERLESS_URL}/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        gotoOptions: {
          waitUntil: opt.waitUntil,
          timeout: 30000
        }
      })
    })

    const html = await response.text()
    const duration = Date.now() - startTime

    // 统计内容完整性指标
    const titleCount = (html.match(/class="titleline"/g) || []).length
    const scriptCount = (html.match(/<script/g) || []).length

    console.log(`  ${opt.name.padEnd(18)} | ${duration}ms | ${html.length} 字符 | ${titleCount} 标题 | ${scriptCount} 脚本`)
  }

  console.log('\n说明:')
  console.log('  - domcontentloaded: 最快，但可能内容不完整')
  console.log('  - load: 等待所有资源加载')
  console.log('  - networkidle2: 最完整，等待网络空闲')
}

/**
 * 对比 HTTP 请求和 Browserless 的结果
 */
async function compareResults(url: string): Promise<ComparisonResult> {
  // 1. 普通 HTTP 请求
  let httpResult = {
    success: false,
    contentLength: 0,
    hasContent: false,
    sampleText: ''
  }

  try {
    const httpResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000)
    })
    const httpHtml = await httpResponse.text()
    const bodyMatch = httpHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
    const bodyText = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, ' ').trim() : ''

    httpResult = {
      success: httpResponse.ok,
      contentLength: httpHtml.length,
      hasContent: bodyText.length > 100,
      sampleText: bodyText.substring(0, 100).trim()
    }
  } catch (error) {
    httpResult.sampleText = error instanceof Error ? error.message : '请求失败'
  }

  // 2. Browserless 请求
  let browserlessResult = {
    success: false,
    contentLength: 0,
    hasContent: false,
    sampleText: ''
  }

  try {
    const blResponse = await fetch(`${BROWSERLESS_URL}/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        gotoOptions: {
          waitUntil: 'networkidle2',
          timeout: 30000
        }
      })
    })
    const blHtml = await blResponse.text()
    const bodyMatch = blHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
    const bodyText = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, ' ').trim() : ''

    browserlessResult = {
      success: blResponse.ok,
      contentLength: blHtml.length,
      hasContent: bodyText.length > 100,
      sampleText: bodyText.substring(0, 100).trim()
    }
  } catch (error) {
    browserlessResult.sampleText = error instanceof Error ? error.message : '请求失败'
  }

  // 对比差异
  let difference = ''
  if (browserlessResult.contentLength > httpResult.contentLength * 1.5) {
    difference = 'Browserless 获取了更多内容（可能是 SPA）'
  } else if (Math.abs(browserlessResult.contentLength - httpResult.contentLength) < httpResult.contentLength * 0.1) {
    difference = '内容相似（静态页面）'
  } else {
    difference = '内容有差异'
  }

  return {
    url,
    httpFetch: httpResult,
    browserless: browserlessResult,
    difference
  }
}

/**
 * 打印对比结果
 */
function printComparison(result: ComparisonResult): void {
  console.log(`\n📊 对比结果:`)
  console.log('')
  console.log(`  HTTP 请求:`)
  console.log(`    状态: ${result.httpFetch.success ? '✅' : '❌'}`)
  console.log(`    长度: ${result.httpFetch.contentLength} 字符`)
  console.log(`    内容: ${result.httpFetch.sampleText?.substring(0, 50) || '(空)'}...`)
  console.log('')
  console.log(`  Browserless:`)
  console.log(`    状态: ${result.browserless.success ? '✅' : '❌'}`)
  console.log(`    长度: ${result.browserless.contentLength} 字符`)
  console.log(`    内容: ${result.browserless.sampleText?.substring(0, 50) || '(空)'}...`)
  console.log('')
  console.log(`  📝 结论: ${result.difference}`)
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('='.repeat(60))
  console.log('Browserless SPA 渲染测试')
  console.log('='.repeat(60))
  console.log(`服务地址: ${BROWSERLESS_URL}`)
  console.log('\n本测试演示 Browserless 处理动态渲染页面的能力')

  try {
    await testStaticPage()
    await testSpaPage()
    await testReactApp()
    await testWaitForElement()
    await testAjaxContent()
    await testWaitUntilImpact()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 所有测试完成')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    process.exit(1)
  }
}

main()
