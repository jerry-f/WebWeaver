/**
 * 多页面内容提取测试
 *
 * 【功能说明】
 * 测试 30 个不同类型的页面，验证内容提取器的通用性
 *
 * 【运行方式】
 * npx tsx scripts/browserless/14-test-multi-pages.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { BrowserlessClient } from './utils/browserless-client'
import { extractFullContent, ExtractResult } from './utils/content-extractor'

const client = new BrowserlessClient()
const OUTPUT_DIR = join(process.cwd(), 'scripts/browserless/output/multi-test')

// 确保输出目录存在
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

// ============================================================================
// 测试页面列表（30个不同类型的页面）
// ============================================================================
// const old_test_list = [
// { name: 'claude-docs', url: 'https://code.claude.com/docs/zh-CN' },
// { name: 'react-docs', url: 'https://react.dev/learn' },
// { name: 'nextjs-docs', url: 'https://nextjs.org/docs' },
// { name: 'tailwind-docs', url: 'https://tailwindcss.com/docs/installation' },
// { name: 'prisma-docs', url: 'https://www.prisma.io/docs/getting-started' },
// { name: 'vercel-blog', url: 'https://vercel.com/blog' },
// { name: 'github-blog', url: 'https://github.blog/' },
// { name: 'cloudflare-blog', url: 'https://blog.cloudflare.com/' },
// { name: 'stripe-blog', url: 'https://stripe.com/blog' },
// { name: 'hackernews', url: 'https://news.ycombinator.com/' },
// { name: 'techcrunch', url: 'https://techcrunch.com/' },
// { name: 'the-verge', url: 'https://www.theverge.com/' },
// { name: 'wired', url: 'https://www.wired.com/' },
// { name: 'zhihu-column', url: 'https://zhuanlan.zhihu.com/p/666419676' },
// { name: 'juejin', url: 'https://juejin.cn/' },
// { name: 'infoq-cn', url: 'https://www.infoq.cn/' },
// { name: 'oschina', url: 'https://www.oschina.net/' },
// { name: 'segmentfault', url: 'https://segmentfault.com/' },
// { name: 'figma', url: 'https://www.figma.com/' },
// { name: 'supabase', url: 'https://supabase.com/' },
// { name: 'planetscale', url: 'https://planetscale.com/' },
// { name: 'joshwcomeau', url: 'https://www.joshwcomeau.com/' },
// { name: 'kentcdodds', url: 'https://kentcdodds.com/blog' },
// ]
const TEST_PAGES = [
  // 技术博客
  { name: 'linear-blog', url: 'https://linear.app/blog' },
  // // 新闻网站
  // { name: 'arstechnica', url: 'https://arstechnica.com/' },
  // // 产品页面
  // { name: 'notion', url: 'https://www.notion.so/' },
  // { name: 'linear', url: 'https://linear.app/' },
  // // 个人博客/文章
  // { name: 'paul-graham', url: 'http://paulgraham.com/articles.html' },
  // { name: 'overreacted', url: 'https://overreacted.io/' },
  // { name: 'leerob', url: 'https://leerob.io/' },
]

// ============================================================================
// 测试结果类型
// ============================================================================

interface TestResult {
  name: string
  url: string
  success: boolean
  title: string
  selector: string | null
  stats: {
    rawLength: number
    readabilityLength: number
    fullLength: number
    sanitizedLength: number
    fullVsReadability: string
    compressionRatio: string
  }
  duration: number
  error?: string
}

// ============================================================================
// 主测试流程
// ============================================================================

async function testPage(page: { name: string; url: string }): Promise<TestResult> {
  const startTime = Date.now()
  const result: TestResult = {
    name: page.name,
    url: page.url,
    success: false,
    title: '',
    selector: null,
    stats: {
      rawLength: 0,
      readabilityLength: 0,
      fullLength: 0,
      sanitizedLength: 0,
      fullVsReadability: '',
      compressionRatio: '',
    },
    duration: 0,
  }

  try {
    // 1. 获取页面 HTML
    const html = await client.getContent(page.url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    // 2. 提取内容
    const extracted = extractFullContent(html, page.url, true)

    result.success = extracted.success
    result.title = extracted.title
    result.selector = extracted.selector
    result.stats.rawLength = extracted.stats.rawLength
    result.stats.readabilityLength = extracted.stats.readabilityLength
    result.stats.fullLength = extracted.stats.fullLength
    result.stats.sanitizedLength = extracted.stats.sanitizedLength

    if (extracted.stats.readabilityLength > 0) {
      const ratio = (extracted.stats.fullLength / extracted.stats.readabilityLength - 1) * 100
      result.stats.fullVsReadability = ratio > 0 ? `+${ratio.toFixed(1)}%` : `${ratio.toFixed(1)}%`
    }

    if (extracted.stats.fullLength > 0) {
      const compression = (1 - extracted.stats.sanitizedLength / extracted.stats.fullLength) * 100
      result.stats.compressionRatio = `-${compression.toFixed(1)}%`
    }

    if (extracted.error) {
      result.error = extracted.error
    }

    // 3. 保存结果（仅成功的）
    if (extracted.success) {
      writeFileSync(join(OUTPUT_DIR, `${page.name}-sanitized.html`), extracted.sanitizedContent)
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
  }

  result.duration = Date.now() - startTime
  return result
}

async function main() {
  console.log('='.repeat(80))
  console.log('多页面内容提取测试')
  console.log('='.repeat(80))
  console.log(`测试页面数量: ${TEST_PAGES.length}`)
  console.log(`输出目录: ${OUTPUT_DIR}`)

  // 检查服务
  console.log('\n📊 检查 Browserless 服务...')
  try {
    const health = await client.checkHealth()
    console.log(`   ✅ 服务可用 (${health.running}/${health.maxConcurrent})`)
  } catch (error) {
    console.error('   ❌ 服务不可用:', error)
    process.exit(1)
  }

  const results: TestResult[] = []
  const startTime = Date.now()

  // 逐个测试
  for (let i = 0; i < TEST_PAGES.length; i++) {
    const page = TEST_PAGES[i]
    console.log(`\n[${i + 1}/${TEST_PAGES.length}] 测试: ${page.name}`)
    console.log(`   URL: ${page.url}`)

    const result = await testPage(page)
    results.push(result)

    if (result.success) {
      console.log(`   ✅ 成功 (${result.duration}ms)`)
      console.log(`   标题: ${result.title.substring(0, 50)}${result.title.length > 50 ? '...' : ''}`)
      console.log(`   选择器: ${result.selector}`)
      console.log(`   内容恢复: ${result.stats.fullVsReadability}, 压缩: ${result.stats.compressionRatio}`)
    } else {
      console.log(`   ❌ 失败: ${result.error}`)
    }
  }

  // ========================================
  // 生成报告
  // ========================================
  const totalDuration = Date.now() - startTime
  const successCount = results.filter((r) => r.success).length
  const failCount = results.filter((r) => !r.success).length

  console.log('\n' + '='.repeat(80))
  console.log('📊 测试报告')
  console.log('='.repeat(80))
  console.log(`总耗时: ${(totalDuration / 1000).toFixed(1)}s`)
  console.log(`成功: ${successCount}/${TEST_PAGES.length} (${((successCount / TEST_PAGES.length) * 100).toFixed(1)}%)`)
  console.log(`失败: ${failCount}/${TEST_PAGES.length}`)

  // 成功列表
  console.log('\n✅ 成功的页面:')
  results
    .filter((r) => r.success)
    .forEach((r) => {
      console.log(`   ${r.name}: ${r.stats.fullVsReadability} / ${r.stats.compressionRatio}`)
    })

  // 失败列表
  if (failCount > 0) {
    console.log('\n❌ 失败的页面:')
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`   ${r.name}: ${r.error}`)
      })
  }

  // 保存 JSON 报告
  // const reportPath = join(OUTPUT_DIR, 'test-report.json')
  // writeFileSync(
  //   reportPath,
  //   JSON.stringify(
  //     {
  //       timestamp: new Date().toISOString(),
  //       totalPages: TEST_PAGES.length,
  //       successCount,
  //       failCount,
  //       totalDuration,
  //       results,
  //     },
  //     null,
  //     2,
  //   ),
  // )
  // console.log(`\n📄 详细报告: ${reportPath}`)

  // 生成 Markdown 报告
  // const mdReport = generateMarkdownReport(results, totalDuration)
  // const mdReportPath = join(OUTPUT_DIR, 'test-report.md')
  // writeFileSync(mdReportPath, mdReport)
  // console.log(`📄 Markdown 报告: ${mdReportPath}`)
}

function generateMarkdownReport(results: TestResult[], totalDuration: number): string {
  const successCount = results.filter((r) => r.success).length

  let md = `# 多页面内容提取测试报告

## 概要

- **测试时间**: ${new Date().toLocaleString('zh-CN')}
- **总页面数**: ${results.length}
- **成功**: ${successCount} (${((successCount / results.length) * 100).toFixed(1)}%)
- **失败**: ${results.length - successCount}
- **总耗时**: ${(totalDuration / 1000).toFixed(1)}s

## 详细结果

| # | 名称 | 成功 | 选择器 | 内容恢复 | 压缩比 | 耗时 |
|---|------|------|--------|----------|--------|------|
`

  results.forEach((r, i) => {
    const success = r.success ? '✅' : '❌'
    const selector = r.selector ? `\`${r.selector.substring(0, 30)}${r.selector.length > 30 ? '...' : ''}\`` : '-'
    const recovery = r.stats.fullVsReadability || '-'
    const compression = r.stats.compressionRatio || '-'
    const duration = `${r.duration}ms`

    md += `| ${i + 1} | ${r.name} | ${success} | ${selector} | ${recovery} | ${compression} | ${duration} |\n`
  })

  // 失败详情
  const failures = results.filter((r) => !r.success)
  if (failures.length > 0) {
    md += `\n## 失败详情\n\n`
    failures.forEach((r) => {
      md += `### ${r.name}\n\n`
      md += `- **URL**: ${r.url}\n`
      md += `- **错误**: ${r.error}\n\n`
    })
  }

  return md
}

main().catch(console.error)
