/**
 * Browserless Screenshot API 测试
 *
 * 【功能说明】
 * 使用 Stealth 模式截取网页图片
 * 支持全页截图、视口截图、不同设备尺寸等
 *
 * 【运行方式】
 * npx tsx scripts/browserless/03-screenshot-api.ts
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

/**
 * 测试 1: 基础截图
 */
async function testBasicScreenshot() {
  console.log('\n📸 测试 1: 基础截图')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)

  const startTime = Date.now()
  const buffer = await client.screenshot(url, {
    waitUntil: 'domcontentloaded',
    timeout: 15000
  })
  const duration = Date.now() - startTime

  const outputPath = join(OUTPUT_DIR, '01-basic.png')
  writeFileSync(outputPath, buffer)

  console.log(`✅ 截图成功`)
  console.log(`   耗时: ${duration}ms`)
  console.log(`   文件大小: ${(buffer.length / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
}

/**
 * 测试 2: 有反爬虫网站截图（Stealth 模式）
 */
async function testAntiScrapingSite() {
  console.log('\n📸 测试 2: 有反爬虫网站截图 (Stealth 模式)')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  console.log(`目标 URL: ${url}`)
  console.log(`说明: 此网站会检测自动化工具，使用 Stealth 模式绕过`)

  const startTime = Date.now()
  const buffer = await client.screenshot(url, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
    fullPage: true
  })
  const duration = Date.now() - startTime

  const outputPath = join(OUTPUT_DIR, '02-hacker-news.png')
  writeFileSync(outputPath, buffer)

  console.log(`✅ 截图成功`)
  console.log(`   耗时: ${duration}ms`)
  console.log(`   文件大小: ${(buffer.length / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
}

/**
 * 测试 3: 不同视口大小
 */
async function testViewportSizes() {
  console.log('\n📸 测试 3: 不同视口大小')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1920, height: 1080 }
  ]

  console.log(`目标 URL: ${url}\n`)

  for (const vp of viewports) {
    const startTime = Date.now()
    const buffer = await client.screenshot(url, {
      viewportWidth: vp.width,
      viewportHeight: vp.height,
      waitUntil: 'domcontentloaded',
      timeout: 10000
    })
    const duration = Date.now() - startTime

    const outputPath = join(OUTPUT_DIR, `03-viewport-${vp.name}.png`)
    writeFileSync(outputPath, buffer)

    console.log(`  ${vp.name.padEnd(8)} (${vp.width}x${vp.height}): ${(buffer.length / 1024).toFixed(2)} KB | ${duration}ms`)
  }
}

/**
 * 测试 4: JPEG 格式与质量
 */
async function testJpegQuality() {
  console.log('\n📸 测试 4: JPEG 格式与质量对比')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  const qualities = [30, 60, 90]

  console.log(`目标 URL: ${url}\n`)

  for (const quality of qualities) {
    const buffer = await client.screenshot(url, {
      type: 'jpeg',
      quality,
      waitUntil: 'domcontentloaded',
      timeout: 10000
    })

    const outputPath = join(OUTPUT_DIR, `04-quality-${quality}.jpg`)
    writeFileSync(outputPath, buffer)

    console.log(`  质量 ${quality}: ${(buffer.length / 1024).toFixed(2)} KB`)
  }

  console.log('\n说明: 质量越高文件越大，根据需求选择合适的质量值')
}

/**
 * 测试 5: 全页截图
 */
async function testFullPage() {
  console.log('\n📸 测试 5: 全页截图')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)

  const startTime = Date.now()
  const buffer = await client.screenshot(url, {
    fullPage: true,
    waitUntil: 'networkidle2',
    timeout: 15000
  })
  const duration = Date.now() - startTime

  const outputPath = join(OUTPUT_DIR, '05-fullpage.png')
  writeFileSync(outputPath, buffer)

  console.log(`✅ 截图成功`)
  console.log(`   耗时: ${duration}ms`)
  console.log(`   文件大小: ${(buffer.length / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60))
  console.log('Browserless Screenshot API 测试 (Stealth 模式)')
  console.log('='.repeat(60))
  console.log(`输出目录: ${OUTPUT_DIR}`)

  try {
    await testBasicScreenshot()
    await testAntiScrapingSite()
    await testViewportSizes()
    await testJpegQuality()
    await testFullPage()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 所有测试完成')
    console.log(`📁 截图已保存到: ${OUTPUT_DIR}`)
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    process.exit(1)
  }
}

main()
