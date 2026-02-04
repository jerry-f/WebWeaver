/**
 * Browserless Function API 测试
 *
 * 【功能说明】
 * 通过 /function 端点执行自定义 Puppeteer/Playwright 代码
 * 这是 Browserless 最强大的功能，可以执行任意浏览器自动化操作
 *
 * 【使用场景】
 * - 复杂的页面交互（点击、输入、滚动）
 * - 需要登录后才能访问的内容
 * - 多步骤的数据抓取流程
 * - 自定义等待逻辑
 * - 截取动态生成的内容
 *
 * 【API 参数说明】
 * - code: 要执行的 JavaScript 代码字符串
 *   - 必须是 CommonJS 模块格式
 *   - 导出一个异步函数，接收 { page, context } 参数
 *   - page: Puppeteer Page 对象
 *   - context: 传入的上下文数据
 * - context: 传递给代码的上下文对象
 *
 * 【运行方式】
 * npx tsx scripts/browserless/06-function-api.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'http://localhost:3300'
const OUTPUT_DIR = join(process.cwd(), 'scripts/browserless/output')

// 确保输出目录存在
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

/**
 * Function API 请求参数
 */
interface FunctionRequest {
  code: string
  context?: Record<string, unknown>
}

/**
 * 测试用例：获取页面信息
 *
 * 演示如何使用 page 对象获取页面的各种信息
 */
async function testGetPageInfo(): Promise<void> {
  console.log('\n⚡ 测试 1: 获取页面信息')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)

  // 自定义代码：获取页面的标题、URL、视口大小等信息
  const code = `
    module.exports = async ({ page, context }) => {
      const { url } = context;

      // 导航到目标页面
      await page.goto(url, { waitUntil: 'networkidle2' });

      // 获取页面信息
      const title = await page.title();
      const currentUrl = page.url();
      const viewport = page.viewport();

      // 获取页面内的一些元素信息
      const info = await page.evaluate(() => {
        return {
          headingCount: document.querySelectorAll('h1, h2, h3').length,
          linkCount: document.querySelectorAll('a').length,
          imageCount: document.querySelectorAll('img').length,
          bodyText: document.body.innerText.substring(0, 200)
        };
      });

      return {
        data: {
          title,
          url: currentUrl,
          viewport,
          ...info
        },
        type: 'application/json'
      };
    };
  `

  const startTime = Date.now()

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      context: { url }
    } as FunctionRequest)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`请求失败: ${response.status} - ${error}`)
  }

  const result = await response.json()
  const duration = Date.now() - startTime

  console.log(`\n✅ 执行成功 (${duration}ms)\n`)
  console.log('页面信息:')
  console.log(`  标题: ${result.title}`)
  console.log(`  URL: ${result.url}`)
  console.log(`  视口: ${result.viewport?.width}x${result.viewport?.height}`)
  console.log(`  标题数: ${result.headingCount}`)
  console.log(`  链接数: ${result.linkCount}`)
  console.log(`  图片数: ${result.imageCount}`)
}

/**
 * 测试用例：表单填写和提交
 *
 * 演示如何在页面中填写表单并执行操作
 */
async function testFormInteraction(): Promise<void> {
  console.log('\n⚡ 测试 2: 表单交互')
  console.log('-'.repeat(40))

  const url = 'https://www.google.com'
  const searchQuery = 'Browserless documentation'
  console.log(`目标 URL: ${url}`)
  console.log(`搜索词: ${searchQuery}`)

  // 自定义代码：在 Google 搜索框中输入内容
  const code = `
    module.exports = async ({ page, context }) => {
      const { url, query } = context;

      await page.goto(url, { waitUntil: 'networkidle2' });

      // 查找搜索输入框
      const searchInput = await page.$('input[name="q"], textarea[name="q"]');

      if (searchInput) {
        // 输入搜索词
        await searchInput.type(query);

        // 等待一下让建议出现
        await new Promise(r => setTimeout(r, 500));

        // 获取输入框的值
        const inputValue = await page.evaluate(
          el => el.value,
          searchInput
        );

        return {
          data: {
            success: true,
            inputFound: true,
            inputValue,
            message: '搜索框已填写'
          },
          type: 'application/json'
        };
      }

      return {
        data: {
          success: false,
          inputFound: false,
          message: '未找到搜索框'
        },
        type: 'application/json'
      };
    };
  `

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      context: { url, query: searchQuery }
    } as FunctionRequest)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`请求失败: ${response.status} - ${error}`)
  }

  const result = await response.json()

  console.log(`\n✅ 执行成功`)
  console.log(`  找到输入框: ${result.inputFound ? '是' : '否'}`)
  console.log(`  输入值: "${result.inputValue || '(无)'}"`)
  console.log(`  消息: ${result.message}`)
}

/**
 * 测试用例：页面点击操作
 */
async function testClickAction(): Promise<void> {
  console.log('\n⚡ 测试 3: 点击操作')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)

  const code = `
    module.exports = async ({ page, context }) => {
      const { url } = context;

      await page.goto(url, { waitUntil: 'networkidle2' });

      // 获取页面上的第一个链接
      const link = await page.$('a');

      if (link) {
        // 获取链接信息
        const linkInfo = await page.evaluate(el => ({
          text: el.innerText,
          href: el.href
        }), link);

        // 点击链接
        await link.click();

        // 等待导航完成
        await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});

        // 获取新页面信息
        const newUrl = page.url();
        const newTitle = await page.title();

        return {
          data: {
            originalLink: linkInfo,
            navigatedTo: {
              url: newUrl,
              title: newTitle
            }
          },
          type: 'application/json'
        };
      }

      return {
        data: { error: '未找到链接' },
        type: 'application/json'
      };
    };
  `

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      context: { url }
    } as FunctionRequest)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`请求失败: ${response.status} - ${error}`)
  }

  const result = await response.json()

  console.log(`\n✅ 执行成功`)
  if (result.originalLink) {
    console.log(`  点击链接: "${result.originalLink.text}"`)
    console.log(`  链接地址: ${result.originalLink.href}`)
    console.log(`  导航到: ${result.navigatedTo?.url}`)
    console.log(`  新标题: ${result.navigatedTo?.title}`)
  } else {
    console.log(`  错误: ${result.error}`)
  }
}

/**
 * 测试用例：执行页面内 JavaScript
 */
async function testEvaluateScript(): Promise<void> {
  console.log('\n⚡ 测试 4: 执行页面内脚本 (evaluate)')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  console.log(`目标 URL: ${url}`)

  const code = `
    module.exports = async ({ page, context }) => {
      const { url } = context;

      await page.goto(url, { waitUntil: 'networkidle2' });

      // 在页面上下文中执行 JavaScript
      const data = await page.evaluate(() => {
        // 获取所有文章标题
        const titles = Array.from(document.querySelectorAll('.titleline > a'))
          .slice(0, 10)
          .map(a => ({
            title: a.textContent,
            url: a.href
          }));

        // 获取页面性能信息
        const performance = window.performance.timing;
        const loadTime = performance.loadEventEnd - performance.navigationStart;

        // 获取页面尺寸
        const dimensions = {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        };

        return { titles, loadTime, dimensions };
      });

      return {
        data,
        type: 'application/json'
      };
    };
  `

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      context: { url }
    } as FunctionRequest)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`请求失败: ${response.status} - ${error}`)
  }

  const result = await response.json()

  console.log(`\n✅ 执行成功`)
  console.log(`\n页面尺寸:`)
  console.log(`  内容: ${result.dimensions?.width}x${result.dimensions?.height}`)
  console.log(`  视口: ${result.dimensions?.viewportWidth}x${result.dimensions?.viewportHeight}`)
  console.log(`\n前 5 篇文章:`)
  for (const [i, item] of (result.titles || []).slice(0, 5).entries()) {
    console.log(`  ${i + 1}. ${item.title?.substring(0, 50)}...`)
  }
}

/**
 * 测试用例：截图并返回
 */
async function testScreenshotInFunction(): Promise<void> {
  console.log('\n⚡ 测试 5: 在 Function 中截图')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)

  const code = `
    module.exports = async ({ page, context }) => {
      const { url } = context;

      await page.goto(url, { waitUntil: 'networkidle2' });

      // 截取屏幕截图
      const screenshot = await page.screenshot({
        type: 'png',
        encoding: 'base64'
      });

      return {
        data: screenshot,
        type: 'image/png;base64'
      };
    };
  `

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      context: { url }
    } as FunctionRequest)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`请求失败: ${response.status} - ${error}`)
  }

  // 响应是 base64 编码的图片
  const base64 = await response.text()
  const buffer = Buffer.from(base64, 'base64')
  const outputPath = join(OUTPUT_DIR, '06-function-screenshot.png')

  writeFileSync(outputPath, buffer)

  console.log(`\n✅ 截图成功`)
  console.log(`   文件大小: ${(buffer.length / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
}

/**
 * 测试用例：等待特定条件
 */
async function testWaitForCondition(): Promise<void> {
  console.log('\n⚡ 测试 6: 等待特定条件')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  console.log(`目标 URL: ${url}`)
  console.log(`等待条件: 页面至少有 10 个文章标题`)

  const code = `
    module.exports = async ({ page, context }) => {
      const { url, minTitles } = context;

      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // 等待至少有指定数量的文章标题
      await page.waitForFunction(
        (min) => document.querySelectorAll('.titleline').length >= min,
        { timeout: 10000 },
        minTitles
      );

      const count = await page.evaluate(
        () => document.querySelectorAll('.titleline').length
      );

      return {
        data: {
          success: true,
          titleCount: count,
          message: '条件满足'
        },
        type: 'application/json'
      };
    };
  `

  const startTime = Date.now()

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      context: { url, minTitles: 10 }
    } as FunctionRequest)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`请求失败: ${response.status} - ${error}`)
  }

  const result = await response.json()
  const duration = Date.now() - startTime

  console.log(`\n✅ 条件满足 (${duration}ms)`)
  console.log(`   文章数量: ${result.titleCount}`)
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('='.repeat(60))
  console.log('Browserless Function API 测试')
  console.log('='.repeat(60))
  console.log(`服务地址: ${BROWSERLESS_URL}`)
  console.log(`输出目录: ${OUTPUT_DIR}`)
  console.log('\n说明: Function API 允许执行任意 Puppeteer 代码')

  try {
    await testGetPageInfo()
    await testFormInteraction()
    await testClickAction()
    await testEvaluateScript()
    await testScreenshotInFunction()
    await testWaitForCondition()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 所有测试完成')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    process.exit(1)
  }
}

main()
