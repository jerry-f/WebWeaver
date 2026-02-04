/**
 * 测试 code.claude.com 网站抓取
 *
 * 【问题分析】
 * 抓取 https://code.claude.com/docs/zh-CN 时报错：
 * - ConnectTimeoutError: 192.168.1.242:3399
 * - 这个地址不对，应该是 localhost:3300
 *
 * 【运行方式】
 * npx tsx scripts/browserless/12-test-claude-docs.ts
 */

import { BrowserlessClient } from './utils/browserless-client'

const client = new BrowserlessClient()

async function main() {
  console.log('='.repeat(60))
  console.log('测试 code.claude.com 网站抓取')
  console.log('='.repeat(60))

  const url = 'https://code.claude.com/docs/zh-CN'
  console.log(`\n目标 URL: ${url}`)

  // 1. 先检查 Browserless 服务状态
  console.log('\n📊 检查 Browserless 服务状态...')
  try {
    const health = await client.checkHealth()
    console.log(`   服务状态: ✅ 可用`)
    console.log(`   运行中: ${health.running}/${health.maxConcurrent}`)
    console.log(`   CPU: ${health.cpu}%`)
    console.log(`   内存: ${health.memory}%`)
  } catch (error) {
    console.error('   服务状态: ❌ 不可用')
    console.error('   错误:', error)
    process.exit(1)
  }

  // 2. 尝试获取页面内容
  console.log('\n🌐 尝试获取页面内容...')
  const startTime = Date.now()

  try {
    const html = await client.getContent(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    })

    const duration = Date.now() - startTime

    // 提取标题
    const titleMatch = html.match(/<title>([^<]+)<\/title>/)
    const title = titleMatch ? titleMatch[1] : '未找到标题'

    console.log(`\n✅ 获取成功! (${duration}ms)`)
    console.log(`   标题: ${title}`)
    console.log(`   内容长度: ${html.length} 字符`)
    console.log(`   预览: ${html.substring(0, 200).replace(/\s+/g, ' ')}...`)

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`\n❌ 获取失败! (${duration}ms)`)
    console.error('   错误:', error)
  }

  // 3. 检查环境变量
  console.log('\n📋 环境变量检查:')
  console.log(`   BROWSERLESS_URL: ${process.env.BROWSERLESS_URL || '未设置 (默认 http://localhost:3300)'}`)
}

main().catch(console.error)
