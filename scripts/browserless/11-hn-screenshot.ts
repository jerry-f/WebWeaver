/**
 * 使用 Stealth 模式对 news.ycombinator.com 截图
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'http://localhost:3300'
const OUTPUT_DIR = join(process.cwd(), 'scripts/browserless/output')

// 确保输出目录存在
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}
async function main() {
  console.log('🥷 使用 Stealth 模式对 Hacker News 截图')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  console.log(`目标 URL: ${url}`)

  const code = `
    module.exports = async ({ page, context }) => {
      // Stealth 伪装
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      });

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

      // 设置视口
      await page.setViewport({ width: 1280, height: 800 });

      await page.goto(context.url, { waitUntil: 'networkidle2', timeout: 30000 });

      // 截图
      const screenshot = await page.screenshot({
        type: 'png',
        encoding: 'base64',
        fullPage: true
      });

      return { data: screenshot, type: 'image/png;base64' };
    };
  `

  const startTime = Date.now()

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, context: { url } })
  })

  const duration = Date.now() - startTime

  if (!response.ok) {
    const error = await response.text()
    console.error(`❌ 截图失败: ${error.substring(0, 200)}`)
    process.exit(1)
  }

  const base64 = await response.text()
  const buffer = Buffer.from(base64, 'base64')
  const outputPath = join(OUTPUT_DIR, '11-hacker-news-stealth.png')

  writeFileSync(outputPath, buffer)

  console.log(`\n✅ 截图成功! (${duration}ms)`)
  console.log(`   文件大小: ${(buffer.length / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
}

main().catch(console.error)
