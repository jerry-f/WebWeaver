#!/usr/bin/env npx tsx
/**
 * 抓取系统测试脚本
 *
 * 用法:
 *   npx tsx scripts/test-scraper.ts              # 运行所有测试
 *   npx tsx scripts/test-scraper.ts --services   # 仅测试服务健康
 *   npx tsx scripts/test-scraper.ts --fetch      # 仅测试抓取功能
 *   npx tsx scripts/test-scraper.ts --queue      # 仅测试队列
 */

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
}

function log(icon: string, msg: string, color = COLORS.reset) {
  console.log(`${color}${icon} ${msg}${COLORS.reset}`)
}

function success(msg: string) { log('✓', msg, COLORS.green) }
function fail(msg: string) { log('✗', msg, COLORS.red) }
function info(msg: string) { log('→', msg, COLORS.blue) }
function warn(msg: string) { log('!', msg, COLORS.yellow) }
function section(title: string) {
  console.log(`\n${COLORS.blue}━━━ ${title} ━━━${COLORS.reset}\n`)
}

// ============================================================
// 1. 服务健康检查
// ============================================================

interface ServiceCheck {
  name: string
  url: string
  check: (res: Response) => Promise<boolean>
}

const SERVICES: ServiceCheck[] = [
  {
    name: 'Go Scraper (HTTP)',
    url: 'http://localhost:8088/health',
    check: async (res) => {
      const data = await res.json()
      return data.status === 'ok' && data.cycleTlsEnabled === true
    }
  },
  {
    name: 'imgproxy',
    url: 'http://localhost:8888/',
    check: async (res) => res.ok
  },
  {
    name: 'Varnish',
    url: 'http://localhost:8889/',
    check: async (res) => res.ok
  },
  {
    name: 'Browserless',
    url: 'http://localhost:3300/pressure',
    check: async (res) => res.ok
  },
  {
    name: 'Redis',
    url: 'http://localhost:6379/',
    check: async () => {
      // Redis 不是 HTTP，用 exec 检查
      const { exec } = await import('child_process')
      return new Promise((resolve) => {
        exec('docker exec newsflow-redis redis-cli ping', (err, stdout) => {
          resolve(stdout.trim() === 'PONG')
        })
      })
    }
  }
]

async function testServices(): Promise<boolean> {
  section('服务健康检查')
  let allPassed = true

  for (const svc of SERVICES) {
    try {
      if (svc.name === 'Redis') {
        const ok = await svc.check(null as any)
        if (ok) success(`${svc.name}`)
        else { fail(`${svc.name}`); allPassed = false }
        continue
      }

      const res = await fetch(svc.url, { signal: AbortSignal.timeout(5000) })
      const ok = await svc.check(res)
      if (ok) success(`${svc.name} (${svc.url})`)
      else { fail(`${svc.name} - 响应异常`); allPassed = false }
    } catch (e: any) {
      fail(`${svc.name} - ${e.message}`)
      allPassed = false
    }
  }

  return allPassed
}

// ============================================================
// 2. 抓取功能测试
// ============================================================

interface FetchTest {
  name: string
  url: string
  expect: {
    hasTitle?: boolean
    hasContent?: boolean
    minContentLength?: number
    strategy?: string
  }
}

const FETCH_TESTS: FetchTest[] = [
  {
    name: '静态页面 (example.com)',
    url: 'https://example.com',
    expect: { hasTitle: true, hasContent: true, strategy: 'cycletls' }
  },
  {
    name: 'Hacker News 首页',
    url: 'https://news.ycombinator.com',
    expect: { hasTitle: true, hasContent: true }
  },
  {
    name: 'GitHub README',
    url: 'https://github.com/nicoxiang/geektime-downloader',
    expect: { hasTitle: true, minContentLength: 100 }
  },
  {
    name: '知乎文章',
    url: 'https://zhuanlan.zhihu.com/p/493407868',
    expect: { hasTitle: true, minContentLength: 500 }
  },
  {
    name: '36kr 快讯',
    url: 'https://36kr.com/newsflashes/3665468896666246',
    expect: { hasTitle: true, minContentLength: 200 }
  },
  {
    name: '36kr 文章',
    url: 'https://36kr.com/p/3664533928161793',
    expect: { hasTitle: true, minContentLength: 200 }
  }
]

async function testFetch(): Promise<boolean> {
  section('抓取功能测试')
  let passed = 0
  let failed = 0

  for (const test of FETCH_TESTS) {
    info(`测试: ${test.name}`)
    console.log(`   ${COLORS.gray}URL: ${test.url}${COLORS.reset}`)

    try {
      const start = Date.now()
      const res = await fetch('http://localhost:8088/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: test.url }),
        signal: AbortSignal.timeout(30000)
      })

      if (!res.ok) {
        fail(`HTTP ${res.status}`)
        failed++
        continue
      }

      const data = await res.json()
      const duration = Date.now() - start

      // 验证结果
      const errors: string[] = []

      if (test.expect.hasTitle && !data.title) {
        errors.push('缺少标题')
      }
      if (test.expect.hasContent && !data.content) {
        errors.push('缺少内容')
      }
      if (test.expect.minContentLength && (data.textContent?.length || 0) < test.expect.minContentLength) {
        errors.push(`内容太短 (${data.textContent?.length || 0} < ${test.expect.minContentLength})`)
      }
      if (test.expect.strategy && data.strategy !== test.expect.strategy) {
        errors.push(`策略不符 (${data.strategy} != ${test.expect.strategy})`)
      }

      if (errors.length === 0) {
        success(`通过 - ${data.strategy}, ${duration}ms, ${data.textContent?.length || 0} 字符`)
        passed++
      } else {
        fail(`失败: ${errors.join(', ')}`)
        console.log('失败 data:', JSON.stringify(data))
        failed++
      }

      // 详情
      console.log(`   ${COLORS.gray}标题: ${data.title?.slice(0, 50)}...${COLORS.reset}`)

    } catch (e: any) {
      fail(`异常: ${e.message}`)
      failed++
    }

    console.log('')
  }

  console.log(`\n结果: ${COLORS.green}${passed} 通过${COLORS.reset}, ${COLORS.red}${failed} 失败${COLORS.reset}`)
  return failed === 0
}

// ============================================================
// 3. 图片代理测试
// ============================================================

async function testImageProxy(): Promise<boolean> {
  section('图片代理测试')

  const testImages = [
    'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png',
    'https://avatars.githubusercontent.com/u/9919?s=200&v=4',
  ]

  let passed = 0

  // 使用 imgproxy 客户端生成正确的签名 URL
  const { ImgproxyClient } = await import('../src/lib/fetchers/clients/imgproxy')
  const client = new ImgproxyClient({
    endpoint: 'http://localhost:8888',
    key: '736563726574',
    salt: '73616c74',
    enableSignature: true  // 启用签名
  })

  for (const imgUrl of testImages) {
    info(`测试图片: ${imgUrl.slice(0, 50)}...`)

    // 使用客户端生成签名 URL
    const proxyUrl = client.generateUrl(imgUrl, { width: 300, height: 200, resizeType: 'fit' })
    console.log(`   ${COLORS.gray}Proxy URL: ${proxyUrl}...${COLORS.reset}`)

    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) })
      const contentType = res.headers.get('content-type')

      if (res.ok && contentType?.startsWith('image/')) {
        success(`通过 - ${contentType}, ${res.headers.get('content-length')} bytes`)
        passed++
      } else {
        fail(`HTTP ${res.status}, Content-Type: ${contentType}`)
      }
    } catch (e: any) {
      fail(`异常: ${e.message}`)
    }
  }

  // 测试 Varnish 缓存
  info('测试 Varnish 缓存...')
  const varnishClient = new ImgproxyClient({
    endpoint: 'http://localhost:8889',  // Varnish 端口
    key: '736563726574',
    salt: '73616c74',
    enableSignature: true
  })
  const varnishUrl = varnishClient.generateUrl(testImages[0], { width: 300, height: 200 })

  try {
    // 第一次请求 (MISS)
    const res1 = await fetch(varnishUrl)
    const cache1 = res1.headers.get('x-cache')

    // 第二次请求 (应该 HIT)
    const res2 = await fetch(varnishUrl)
    const cache2 = res2.headers.get('x-cache')

    if (cache2 === 'HIT') {
      success(`Varnish 缓存工作正常 (第一次: ${cache1}, 第二次: ${cache2})`)
      passed++
    } else {
      warn(`Varnish 缓存未命中 (${cache1} -> ${cache2})`)
    }
  } catch (e: any) {
    fail(`Varnish 测试异常: ${e.message}`)
  }

  return passed >= 2
}

// ============================================================
// 4. BullMQ 队列测试
// ============================================================

async function testQueue(): Promise<boolean> {
  section('BullMQ 队列测试')

  try {
    // 动态导入队列模块
    const { getFetchQueue, addFetchJob, getQueueStats } = await import('../src/lib/queue/queues')

    // 获取队列状态
    info('获取队列状态...')
    const stats = await getQueueStats()
    success(`抓取队列: waiting=${stats.fetch.waiting}, active=${stats.fetch.active}, completed=${stats.fetch.completed}`)
    success(`摘要队列: waiting=${stats.summary.waiting}, active=${stats.summary.active}`)

    // 添加测试任务
    info('添加测试任务...')
    const testJob = await addFetchJob({
      articleId: 'test-' + Date.now(),
      url: 'https://example.com',
      sourceId: 'test-source',
      strategy: 'go',
      priority: 1
    })
    success(`任务已添加: ${testJob.id}`)

    // 等待片刻检查状态
    await new Promise(r => setTimeout(r, 1000))
    const newStats = await getQueueStats()
    info(`更新后队列状态: waiting=${newStats.fetch.waiting}`)

    return true
  } catch (e: any) {
    fail(`队列测试异常: ${e.message}`)
    warn('提示: 确保 Worker 已启动，或在 Next.js 环境中运行')
    return false
  }
}

// ============================================================
// 5. gRPC 测试
// ============================================================

async function testGrpc(): Promise<boolean> {
  section('gRPC 接口测试')

  try {
    const { GoScraperGrpcClient } = await import('../src/lib/fetchers/clients/grpc-client')

    const client = new GoScraperGrpcClient({ address: 'localhost:50051' })

    // 健康检查
    info('测试 gRPC 健康检查...')
    const health = await client.healthCheck()
    if (health.status === 'ok') {
      success(`健康检查通过: 可用并发=${health.available}, CycleTLS=${health.cycletlsEnabled}`)
    } else {
      fail(`健康检查失败: ${health.status}`)
      return false
    }

    // 抓取测试
    info('测试 gRPC 抓取...')
    const result = await client.fetchArticle('https://example.com', { timeoutMs: 10000 })

    if (result && result.title) {
      success(`gRPC 抓取成功: ${result.title}`)
      success(`策略: ${result.strategy}, 耗时: ${result.durationMs}ms`)
      return true
    } else {
      fail('gRPC 返回结果异常')
      return false
    }
  } catch (e: any) {
    fail(`gRPC 测试异常: ${e.message}`)
    return false
  }
}

// ============================================================
// 6. 性能基准测试
// ============================================================

async function testPerformance(): Promise<void> {
  section('性能基准测试')

  const testUrl = 'https://example.com'
  const iterations = 10

  info(`测试 URL: ${testUrl}`)
  info(`迭代次数: ${iterations}`)

  const times: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = Date.now()
    await fetch('http://localhost:8088/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: testUrl }),
    })
    times.push(Date.now() - start)
    process.stdout.write('.')
  }
  console.log('')

  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const min = Math.min(...times)
  const max = Math.max(...times)
  const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)]

  console.log(`
${COLORS.blue}性能统计:${COLORS.reset}
  平均耗时: ${avg.toFixed(0)}ms
  最小耗时: ${min}ms
  最大耗时: ${max}ms
  P95 耗时: ${p95}ms
  QPS (理论): ${(1000 / avg).toFixed(1)} req/s
`)
}

// ============================================================
// 主函数
// ============================================================

async function main() {
  console.log(`
${COLORS.blue}╔═══════════════════════════════════════════╗
║     NewsFlow 抓取系统测试套件              ║
╚═══════════════════════════════════════════╝${COLORS.reset}
`)

  const args = process.argv.slice(2)
  const runAll = args.length === 0
  const results: { name: string; passed: boolean }[] = []

  // 服务健康检查
  if (runAll || args.includes('--services')) {
    const passed = await testServices()
    results.push({ name: '服务健康', passed })
    if (!passed && runAll) {
      fail('\n服务检查未通过，请先启动所有服务: docker compose up -d\n')
      process.exit(1)
    }
  }

  // 抓取测试
  if (runAll || args.includes('--fetch')) {
    const passed = await testFetch()
    results.push({ name: '抓取功能', passed })
  }

  // 图片代理测试
  if (runAll || args.includes('--image')) {
    const passed = await testImageProxy()
    results.push({ name: '图片代理', passed })
  }

  // gRPC 测试
  if (runAll || args.includes('--grpc')) {
    const passed = await testGrpc()
    results.push({ name: 'gRPC 接口', passed })
  }

  // 队列测试
  if (args.includes('--queue')) {
    const passed = await testQueue()
    results.push({ name: 'BullMQ 队列', passed })
  }

  // 性能测试
  if (args.includes('--perf')) {
    await testPerformance()
  }

  // 汇总
  if (results.length > 0) {
    section('测试汇总')
    for (const r of results) {
      if (r.passed) success(r.name)
      else fail(r.name)
    }

    const allPassed = results.every(r => r.passed)
    console.log(`\n${allPassed ? COLORS.green + '✓ 所有测试通过！' : COLORS.red + '✗ 部分测试失败'}${COLORS.reset}\n`)
    process.exit(allPassed ? 0 : 1)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
