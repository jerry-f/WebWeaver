/**
 * Browserless PDF API 测试
 *
 * 【功能说明】
 * 通过 /pdf 端点将网页转换为 PDF 文档
 * 支持多种纸张大小、页边距、页眉页脚等选项
 *
 * 【使用场景】
 * - 将网页内容导出为可打印的 PDF
 * - 生成报告、发票等文档
 * - 保存网页内容的离线版本
 * - 批量生成 PDF 文档
 *
 * 【API 参数说明】
 * - url: 目标页面 URL（与 html 二选一）
 * - html: 直接传入 HTML 内容
 * - options: PDF 选项
 *   - format: 纸张大小 ('A4' | 'Letter' | 'Legal' 等)
 *   - width/height: 自定义尺寸
 *   - margin: 页边距 { top, bottom, left, right }
 *   - printBackground: 是否包含背景
 *   - landscape: 横向打印
 *   - displayHeaderFooter: 显示页眉页脚
 *   - headerTemplate/footerTemplate: 自定义页眉页脚
 *
 * 【运行方式】
 * npx tsx scripts/browserless/04-pdf-api.ts
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
 * PDF API 请求参数
 */
interface PdfRequest {
  url?: string
  html?: string
  options?: {
    format?: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'Tabloid'
    width?: string
    height?: string
    margin?: {
      top?: string
      bottom?: string
      left?: string
      right?: string
    }
    printBackground?: boolean
    landscape?: boolean
    displayHeaderFooter?: boolean
    headerTemplate?: string
    footerTemplate?: string
    scale?: number
    pageRanges?: string
  }
  gotoOptions?: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
    timeout?: number
  }
}

/**
 * 测试用例：基础 PDF 生成
 */
async function testBasicPdf(): Promise<void> {
  console.log('\n📄 测试 1: 基础 PDF 生成')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)

  const startTime = Date.now()

  const response = await fetch(`${BROWSERLESS_URL}/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      options: {
        format: 'A4',
        printBackground: true
      },
      gotoOptions: {
        waitUntil: 'networkidle2',
        timeout: 30000
      }
    } as PdfRequest)
  })

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  const duration = Date.now() - startTime
  const outputPath = join(OUTPUT_DIR, '01-basic.pdf')

  writeFileSync(outputPath, Buffer.from(buffer))

  console.log(`✅ 生成成功`)
  console.log(`   耗时: ${duration}ms`)
  console.log(`   文件大小: ${(buffer.byteLength / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
}

/**
 * 测试用例：从 HTML 生成 PDF
 *
 * 直接传入 HTML 内容，无需访问外部 URL
 * 适合生成动态内容的 PDF
 */
async function testHtmlToPdf(): Promise<void> {
  console.log('\n📄 测试 2: 从 HTML 生成 PDF')
  console.log('-'.repeat(40))

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Arial', sans-serif;
          padding: 40px;
          line-height: 1.6;
        }
        h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        .info { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background: #007bff; color: white; }
        tr:nth-child(even) { background: #f9f9f9; }
      </style>
    </head>
    <body>
      <h1>Browserless PDF 测试报告</h1>
      <div class="info">
        <p><strong>生成时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
        <p><strong>服务地址:</strong> ${BROWSERLESS_URL}</p>
      </div>
      <h2>测试数据表格</h2>
      <table>
        <tr><th>项目</th><th>状态</th><th>备注</th></tr>
        <tr><td>健康检查</td><td>✅ 通过</td><td>服务正常运行</td></tr>
        <tr><td>截图功能</td><td>✅ 通过</td><td>支持多种格式</td></tr>
        <tr><td>PDF 生成</td><td>✅ 通过</td><td>支持自定义选项</td></tr>
      </table>
      <p>这是一个通过 Browserless 生成的 PDF 文档示例。</p>
    </body>
    </html>
  `

  console.log(`HTML 内容长度: ${html.length} 字符`)

  const startTime = Date.now()

  const response = await fetch(`${BROWSERLESS_URL}/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html,
      options: {
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          bottom: '20mm',
          left: '15mm',
          right: '15mm'
        }
      }
    } as PdfRequest)
  })

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  const duration = Date.now() - startTime
  const outputPath = join(OUTPUT_DIR, '02-from-html.pdf')

  writeFileSync(outputPath, Buffer.from(buffer))

  console.log(`✅ 生成成功`)
  console.log(`   耗时: ${duration}ms`)
  console.log(`   文件大小: ${(buffer.byteLength / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
}

/**
 * 测试用例：不同纸张大小
 */
async function testPaperSizes(): Promise<void> {
  console.log('\n📄 测试 3: 不同纸张大小')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  const formats: Array<'A4' | 'A5' | 'Letter'> = ['A4', 'A5', 'Letter']

  console.log(`目标 URL: ${url}\n`)

  for (const format of formats) {
    const response = await fetch(`${BROWSERLESS_URL}/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        options: { format, printBackground: true },
        gotoOptions: { waitUntil: 'domcontentloaded', timeout: 10000 }
      } as PdfRequest)
    })

    const buffer = await response.arrayBuffer()
    const outputPath = join(OUTPUT_DIR, `03-format-${format.toLowerCase()}.pdf`)

    writeFileSync(outputPath, Buffer.from(buffer))

    console.log(`  ${format.padEnd(8)}: ${(buffer.byteLength / 1024).toFixed(2)} KB`)
  }
}

/**
 * 测试用例：横向打印
 */
async function testLandscape(): Promise<void> {
  console.log('\n📄 测试 4: 横向打印 (landscape)')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  console.log(`目标 URL: ${url}`)

  const response = await fetch(`${BROWSERLESS_URL}/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      options: {
        format: 'A4',
        landscape: true,
        printBackground: true
      },
      gotoOptions: {
        waitUntil: 'networkidle2',
        timeout: 30000
      }
    } as PdfRequest)
  })

  const buffer = await response.arrayBuffer()
  const outputPath = join(OUTPUT_DIR, '04-landscape.pdf')

  writeFileSync(outputPath, Buffer.from(buffer))

  console.log(`✅ 生成成功`)
  console.log(`   文件大小: ${(buffer.byteLength / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
}

/**
 * 测试用例：页眉页脚
 */
async function testHeaderFooter(): Promise<void> {
  console.log('\n📄 测试 5: 自定义页眉页脚')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)

  // 页眉页脚模板支持以下变量：
  // - date: 格式化的日期
  // - title: 页面标题
  // - url: 页面 URL
  // - pageNumber: 当前页码
  // - totalPages: 总页数
  const headerTemplate = `
    <div style="font-size: 10px; width: 100%; text-align: center; color: #666;">
      <span>Browserless PDF 测试 - 生成于 <span class="date"></span></span>
    </div>
  `

  const footerTemplate = `
    <div style="font-size: 10px; width: 100%; text-align: center; color: #666;">
      <span>第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</span>
    </div>
  `

  const response = await fetch(`${BROWSERLESS_URL}/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      options: {
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin: {
          top: '25mm',
          bottom: '25mm',
          left: '15mm',
          right: '15mm'
        }
      },
      gotoOptions: {
        waitUntil: 'networkidle2',
        timeout: 30000
      }
    } as PdfRequest)
  })

  const buffer = await response.arrayBuffer()
  const outputPath = join(OUTPUT_DIR, '05-header-footer.pdf')

  writeFileSync(outputPath, Buffer.from(buffer))

  console.log(`✅ 生成成功`)
  console.log(`   文件大小: ${(buffer.byteLength / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
  console.log('\n说明: 页眉页脚使用特殊 class 来插入变量')
  console.log('  - .date: 当前日期')
  console.log('  - .pageNumber: 页码')
  console.log('  - .totalPages: 总页数')
}

/**
 * 测试用例：自定义尺寸
 */
async function testCustomSize(): Promise<void> {
  console.log('\n📄 测试 6: 自定义尺寸')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  console.log(`目标 URL: ${url}`)
  console.log(`自定义尺寸: 200mm x 150mm`)

  const response = await fetch(`${BROWSERLESS_URL}/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      options: {
        width: '200mm',
        height: '150mm',
        printBackground: true
      },
      gotoOptions: {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      }
    } as PdfRequest)
  })

  const buffer = await response.arrayBuffer()
  const outputPath = join(OUTPUT_DIR, '06-custom-size.pdf')

  writeFileSync(outputPath, Buffer.from(buffer))

  console.log(`✅ 生成成功`)
  console.log(`   文件大小: ${(buffer.byteLength / 1024).toFixed(2)} KB`)
  console.log(`   保存路径: ${outputPath}`)
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('='.repeat(60))
  console.log('Browserless PDF API 测试')
  console.log('='.repeat(60))
  console.log(`服务地址: ${BROWSERLESS_URL}`)
  console.log(`输出目录: ${OUTPUT_DIR}`)

  try {
    await testBasicPdf()
    await testHtmlToPdf()
    await testPaperSizes()
    await testLandscape()
    await testHeaderFooter()
    await testCustomSize()

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
