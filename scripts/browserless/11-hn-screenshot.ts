/**
 * 使用 Stealth 模式对 news.ycombinator.com 截图
 *
 * 【功能说明】
 * 演示使用 BrowserlessClient 对有反爬虫检测的网站进行截图
 *
 * 【运行方式】
 * npx tsx scripts/browserless/11-hn-screenshot.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { BrowserlessClient } from './utils/browserless-client'

const client = new BrowserlessClient()
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

  const startTime = Date.now()

  // 使用 BrowserlessClient 截图（自动启用 Stealth 模式）
  const buffer = await client.screenshot(url, {
    waitUntil: 'networkidle2',
    timeout: 30000,
    fullPage: true,
    type: 'png'
  })

  const duration = Date.now() - startTime
  const outputPath = join(OUTPUT_DIR, '11-hacker-news-stealth.png')

  writeFileSync(outputPath, buffer)

  console.log(`\n✅ 截图成功! (${duration}ms)`)
  console.log(`   文件大小: ${(buffer.length / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
}

main().catch(console.error)
