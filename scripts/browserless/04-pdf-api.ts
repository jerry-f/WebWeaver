/**
 * Browserless PDF API 测试
 *
 * 【功能说明】
 * 使用 Stealth 模式将网页转换为 PDF 文档
 *
 * 【运行方式】
 * npx tsx scripts/browserless/04-pdf-api.ts
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
 * 测试 1: 基础 PDF 生成
 */
async function testBasicPdf() {
  console.log('\n📄 测试 1: 基础 PDF 生成')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)

  const startTime = Date.now()
  const buffer = await client.pdf(url, {
    waitUntil: 'domcontentloaded',
    timeout: 15000
  })
  const duration = Date.now() - startTime

  const outputPath = join(OUTPUT_DIR, '04-basic.pdf')
  writeFileSync(outputPath, buffer)

  console.log(`✅ PDF 生成成功`)
  console.log(`   耗时: ${duration}ms`)
  console.log(`   文件大小: ${(buffer.length / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
}

/**
 * 测试 2: 有反爬虫网站 PDF（Stealth 模式）
 */
async function testAntiScrapingSite() {
  console.log('\n📄 测试 2: 有反爬虫网站 PDF (Stealth 模式)')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  console.log(`目标 URL: ${url}`)
  console.log(`说明: 此网站会检测自动化工具，使用 Stealth 模式绕过`)

  const startTime = Date.now()
  const buffer = await client.pdf(url, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
    format: 'A4'
  })
  const duration = Date.now() - startTime

  const outputPath = join(OUTPUT_DIR, '04-hacker-news.pdf')
  writeFileSync(outputPath, buffer)

  console.log(`✅ PDF 生成成功`)
  console.log(`   耗时: ${duration}ms`)
  console.log(`   文件大小: ${(buffer.length / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
}

/**
 * 测试 3: 横向 PDF
 */
async function testLandscapePdf() {
  console.log('\n📄 测试 3: 横向 PDF')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)

  const buffer = await client.pdf(url, {
    waitUntil: 'domcontentloaded',
    timeout: 10000,
    landscape: true
  })

  const outputPath = join(OUTPUT_DIR, '04-landscape.pdf')
  writeFileSync(outputPath, buffer)

  console.log(`✅ PDF 生成成功`)
  console.log(`   文件大小: ${(buffer.length / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60))
  console.log('Browserless PDF API 测试 (Stealth 模式)')
  console.log('='.repeat(60))
  console.log(`输出目录: ${OUTPUT_DIR}`)

  try {
    await testBasicPdf()
    await testAntiScrapingSite()
    await testLandscapePdf()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 所有测试完成')
    console.log(`📁 PDF 已保存到: ${OUTPUT_DIR}`)
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    process.exit(1)
  }
}

main()
