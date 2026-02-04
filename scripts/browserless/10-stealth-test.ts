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

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'http://localhost:3300'

/**
 * 测试用例：检测默认配置的指纹
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
        // Chrome 特有检测
        chrome: !!window.chrome,
        // 权限 API
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

  return data
}

/**
 * 测试用例：使用 Stealth 伪装后的指纹
 */
async function testStealthFingerprint(): Promise<void> {
  console.log('\n🥷 测试 2: Stealth 伪装后的浏览器指纹')
  console.log('-'.repeat(40))

  const code = `
    module.exports = async ({ page, context }) => {
      // ===== Stealth 伪装开始 =====

      // 1. 隐藏 webdriver 标志
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });

      // 2. 设置正常的 UserAgent（去掉 Headless）
      await page.setUserAgent(context.userAgent);

      // 3. 模拟 Chrome 插件
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const plugins = [
              { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
              { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
              { name: 'Native Client', filename: 'internal-nacl-plugin' }
            ];
            plugins.length = 3;
            return plugins;
          },
        });
      });

      // 4. 模拟语言设置
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'languages', {
          get: () => ['zh-CN', 'zh', 'en-US', 'en'],
        });
      });

      // 5. 添加 chrome 对象（某些网站检测这个）
      await page.evaluateOnNewDocument(() => {
        window.chrome = {
          runtime: {},
          loadTimes: function() {},
          csi: function() {},
          app: {}
        };
      });

      // 6. 修改 permissions API 行为
      await page.evaluateOnNewDocument(() => {
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      });

      // ===== Stealth 伪装结束 =====

      await page.goto('about:blank');

      const fingerprint = await page.evaluate(() => ({
        webdriver: navigator.webdriver,
        userAgent: navigator.userAgent,
        plugins: navigator.plugins.length,
        languages: navigator.languages,
        platform: navigator.platform,
        chrome: !!window.chrome,
      }));

      return { data: fingerprint, type: 'application/json' };
    };
  `

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      context: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      }
    })
  })

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`)
  }

  const data = await response.json()

  console.log('伪装后结果:')
  console.log(`  webdriver:     ${data.webdriver} ${data.webdriver ? '🚨 暴露!' : '✅ 隐藏'}`)
  console.log(`  userAgent:     ${data.userAgent.includes('Headless') ? '🚨 包含 Headless!' : '✅ 正常'}`)
  console.log(`  plugins:       ${data.plugins} 个`)
  console.log(`  languages:     ${JSON.stringify(data.languages)}`)
  console.log(`  chrome 对象:   ${data.chrome ? '✅ 存在' : '❌ 缺失'}`)

  return data
}

/**
 * 测试用例：使用 Stealth 访问有反爬虫的网站
 */
async function testStealthOnRealSite(): Promise<void> {
  console.log('\n🌐 测试 3: 使用 Stealth 访问 news.ycombinator.com')
  console.log('-'.repeat(40))

  const stealthCode = `
    module.exports = async ({ page, context }) => {
      // Stealth 伪装
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

      await page.evaluateOnNewDocument(() => {
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
      });

      try {
        await page.goto(context.url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        const content = await page.content();
        const title = await page.title();

        return {
          data: {
            success: true,
            title,
            contentLength: content.length,
            preview: content.substring(0, 500)
          },
          type: 'application/json'
        };
      } catch (error) {
        return {
          data: {
            success: false,
            error: error.message
          },
          type: 'application/json'
        };
      }
    };
  `

  const startTime = Date.now()

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: stealthCode,
      context: { url: 'https://news.ycombinator.com' }
    })
  })

  const duration = Date.now() - startTime

  if (!response.ok) {
    const error = await response.text()
    console.log(`❌ 请求失败: ${error.substring(0, 100)}`)
    return
  }

  const data = await response.json()

  if (data.success) {
    console.log(`✅ 访问成功! (${duration}ms)`)
    console.log(`   标题: ${data.title}`)
    console.log(`   内容长度: ${data.contentLength} 字符`)
    console.log(`   预览: ${data.preview}...`)
  } else {
    console.log(`❌ 访问失败: ${data.error}`)
  }
}

/**
 * 测试用例：对比普通模式和 Stealth 模式
 */
async function testComparison(): Promise<void> {
  console.log('\n📊 测试 4: 普通模式 vs Stealth 模式对比')
  console.log('-'.repeat(40))

  const url = 'https://bot.sannysoft.com'
  console.log(`目标 URL: ${url}`)
  console.log('这是一个专门检测自动化工具的网站\n')

  // 普通模式
  console.log('普通模式截图中...')
  const normalCode = `
    module.exports = async ({ page, context }) => {
      await page.goto(context.url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000));
      const screenshot = await page.screenshot({ type: 'png', encoding: 'base64', fullPage: true });
      return { data: screenshot, type: 'image/png;base64' };
    };
  `

  const normalResponse = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: normalCode, context: { url } })
  })

  if (normalResponse.ok) {
    const base64 = await normalResponse.text()
    const buffer = Buffer.from(base64, 'base64')
    const { writeFileSync } = await import('fs')
    const { join } = await import('path')
    const outputPath = join(process.cwd(), 'scripts/browserless/output', '10-normal-mode.png')
    writeFileSync(outputPath, buffer)
    console.log(`  ✅ 已保存: ${outputPath}`)
  }

  // Stealth 模式
  console.log('Stealth 模式截图中...')
  const stealthCode = `
    module.exports = async ({ page, context }) => {
      // Stealth 伪装
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      });

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

      await page.goto(context.url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000));
      const screenshot = await page.screenshot({ type: 'png', encoding: 'base64', fullPage: true });
      return { data: screenshot, type: 'image/png;base64' };
    };
  `

  const stealthResponse = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: stealthCode, context: { url } })
  })

  if (stealthResponse.ok) {
    const base64 = await stealthResponse.text()
    const buffer = Buffer.from(base64, 'base64')
    const { writeFileSync } = await import('fs')
    const { join } = await import('path')
    const outputPath = join(process.cwd(), 'scripts/browserless/output', '10-stealth-mode.png')
    writeFileSync(outputPath, buffer)
    console.log(`  ✅ 已保存: ${outputPath}`)
  }

  console.log('\n📝 请对比两张截图，查看检测结果的差异')
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
