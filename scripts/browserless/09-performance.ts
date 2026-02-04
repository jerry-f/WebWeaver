/**
 * Browserless 性能与并发测试
 *
 * 【功能说明】
 * 测试 Browserless 服务的性能特性和并发处理能力
 * 帮助了解服务的限制和最佳使用方式
 *
 * 【测试内容】
 * 1. 单请求响应时间
 * 2. 并发请求处理
 * 3. 队列排队机制
 * 4. 资源使用监控
 * 5. 超时处理
 *
 * 【服务配置回顾】
 * - MAX_CONCURRENT_SESSIONS=5 (最大并发 5 个)
 * - MAX_QUEUE_LENGTH=50 (最大排队 50 个)
 * - CONNECTION_TIMEOUT=120000 (连接超时 120 秒)
 *
 * 【运行方式】
 * npx tsx scripts/browserless/09-performance.ts
 */

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'http://localhost:3300'

/**
 * 性能测试结果
 */
interface PerformanceResult {
  url: string
  duration: number
  success: boolean
  error?: string
}

/**
 * 测试用例：单请求基准测试
 */
async function testSingleRequestBenchmark(): Promise<void> {
  console.log('\n⏱️ 测试 1: 单请求基准测试')
  console.log('-'.repeat(40))

  const urls = [
    { name: '简单页面', url: 'https://example.com' },
    { name: '中等页面', url: 'https://news.ycombinator.com' },
    { name: '复杂页面', url: 'https://github.com' }
  ]

  console.log('测试不同复杂度页面的响应时间:\n')

  for (const item of urls) {
    const times: number[] = []

    // 测试 3 次取平均
    for (let i = 0; i < 3; i++) {
      const startTime = Date.now()

      const response = await fetch(`${BROWSERLESS_URL}/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: item.url,
          gotoOptions: {
            waitUntil: 'networkidle2',
            timeout: 30000
          }
        })
      })

      if (response.ok) {
        await response.text()
        times.push(Date.now() - startTime)
      }
    }

    if (times.length > 0) {
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      const min = Math.min(...times)
      const max = Math.max(...times)
      console.log(`  ${item.name.padEnd(10)} | 平均: ${avg}ms | 最快: ${min}ms | 最慢: ${max}ms`)
    }
  }
}

/**
 * 测试用例：并发请求测试
 */
async function testConcurrentRequests(): Promise<void> {
  console.log('\n⏱️ 测试 2: 并发请求测试')
  console.log('-'.repeat(40))

  const url = 'https://example.com'
  const concurrencyLevels = [1, 3, 5, 8]

  console.log(`目标 URL: ${url}`)
  console.log('测试不同并发级别:\n')

  for (const concurrency of concurrencyLevels) {
    const startTime = Date.now()

    // 创建并发请求
    const promises = Array.from({ length: concurrency }, async (_, i) => {
      const reqStart = Date.now()
      try {
        const response = await fetch(`${BROWSERLESS_URL}/content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            gotoOptions: {
              waitUntil: 'domcontentloaded',
              timeout: 30000
            }
          })
        })
        await response.text()
        return {
          index: i,
          success: response.ok,
          duration: Date.now() - reqStart
        }
      } catch (error) {
        return {
          index: i,
          success: false,
          duration: Date.now() - reqStart,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    })

    const results = await Promise.all(promises)
    const totalTime = Date.now() - startTime
    const successCount = results.filter(r => r.success).length
    const avgTime = Math.round(results.reduce((a, r) => a + r.duration, 0) / results.length)

    console.log(`  并发 ${concurrency}: 总耗时 ${totalTime}ms | 成功 ${successCount}/${concurrency} | 平均 ${avgTime}ms`)
  }

  console.log('\n说明: 服务配置 MAX_CONCURRENT_SESSIONS=5')
  console.log('      超过限制的请求会进入队列等待')
}

/**
 * 测试用例：服务压力监控
 */
async function testPressureMonitoring(): Promise<void> {
  console.log('\n⏱️ 测试 3: 压力监控')
  console.log('-'.repeat(40))

  console.log('在并发请求期间监控服务状态:\n')

  // 获取初始状态
  const initialPressure = await getPressure()
  console.log('初始状态:')
  printPressure(initialPressure)

  // 发起并发请求
  console.log('\n发起 5 个并发请求...')

  const url = 'https://example.com'
  const requests = Array.from({ length: 5 }, () =>
    fetch(`${BROWSERLESS_URL}/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        gotoOptions: { waitUntil: 'networkidle2', timeout: 30000 }
      })
    })
  )

  // 等待一小段时间后检查状态
  await new Promise(r => setTimeout(r, 500))
  const duringPressure = await getPressure()
  console.log('\n请求进行中:')
  printPressure(duringPressure)

  // 等待所有请求完成
  await Promise.all(requests)

  // 最终状态
  await new Promise(r => setTimeout(r, 500))
  const finalPressure = await getPressure()
  console.log('\n请求完成后:')
  printPressure(finalPressure)
}

/**
 * 测试用例：超时处理
 */
async function testTimeoutHandling(): Promise<void> {
  console.log('\n⏱️ 测试 4: 超时处理')
  console.log('-'.repeat(40))

  console.log('测试不同超时设置的效果:\n')

  const url = 'https://example.com'
  const timeouts = [1000, 5000, 30000]

  for (const timeout of timeouts) {
    const startTime = Date.now()

    try {
      const response = await fetch(`${BROWSERLESS_URL}/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          gotoOptions: {
            waitUntil: 'networkidle2',
            timeout
          }
        }),
        signal: AbortSignal.timeout(timeout + 5000)
      })

      const duration = Date.now() - startTime
      const success = response.ok

      if (success) {
        console.log(`  超时 ${timeout}ms: ✅ 成功 (${duration}ms)`)
      } else {
        console.log(`  超时 ${timeout}ms: ❌ 失败 (${duration}ms) - ${response.status}`)
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.log(`  超时 ${timeout}ms: ❌ 错误 (${duration}ms) - ${message.substring(0, 50)}`)
    }
  }
}

/**
 * 测试用例：批量请求策略
 */
async function testBatchStrategy(): Promise<void> {
  console.log('\n⏱️ 测试 5: 批量请求策略对比')
  console.log('-'.repeat(40))

  const urls = [
    'https://example.com',
    'https://httpbin.org/html',
    'https://news.ycombinator.com'
  ]

  console.log(`批量抓取 ${urls.length} 个 URL\n`)

  // 策略 1: 串行请求
  console.log('策略 1: 串行请求')
  const serialStart = Date.now()
  for (const url of urls) {
    await fetch(`${BROWSERLESS_URL}/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        gotoOptions: { waitUntil: 'domcontentloaded', timeout: 10000 }
      })
    })
  }
  const serialTime = Date.now() - serialStart
  console.log(`  总耗时: ${serialTime}ms`)

  // 策略 2: 并行请求
  console.log('\n策略 2: 并行请求')
  const parallelStart = Date.now()
  await Promise.all(urls.map(url =>
    fetch(`${BROWSERLESS_URL}/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        gotoOptions: { waitUntil: 'domcontentloaded', timeout: 10000 }
      })
    })
  ))
  const parallelTime = Date.now() - parallelStart
  console.log(`  总耗时: ${parallelTime}ms`)

  // 策略 3: 控制并发的批量请求
  console.log('\n策略 3: 限制并发 (2 个一批)')
  const batchStart = Date.now()
  for (let i = 0; i < urls.length; i += 2) {
    const batch = urls.slice(i, i + 2)
    await Promise.all(batch.map(url =>
      fetch(`${BROWSERLESS_URL}/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          gotoOptions: { waitUntil: 'domcontentloaded', timeout: 10000 }
        })
      })
    ))
  }
  const batchTime = Date.now() - batchStart
  console.log(`  总耗时: ${batchTime}ms`)

  console.log('\n📊 对比:')
  console.log(`  串行: ${serialTime}ms (基准)`)
  console.log(`  并行: ${parallelTime}ms (${((serialTime - parallelTime) / serialTime * 100).toFixed(1)}% 更快)`)
  console.log(`  批量: ${batchTime}ms (${((serialTime - batchTime) / serialTime * 100).toFixed(1)}% 更快)`)
}

/**
 * 测试用例：waitUntil 性能对比
 */
async function testWaitUntilPerformance(): Promise<void> {
  console.log('\n⏱️ 测试 6: waitUntil 选项性能对比')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  const options = ['domcontentloaded', 'load', 'networkidle2'] as const

  console.log(`目标 URL: ${url}\n`)

  for (const waitUntil of options) {
    const times: number[] = []

    for (let i = 0; i < 3; i++) {
      const startTime = Date.now()
      await fetch(`${BROWSERLESS_URL}/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          gotoOptions: { waitUntil, timeout: 30000 }
        })
      })
      times.push(Date.now() - startTime)
    }

    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    console.log(`  ${waitUntil.padEnd(18)} | 平均: ${avg}ms`)
  }

  console.log('\n建议:')
  console.log('  - domcontentloaded: 最快，适合静态页面')
  console.log('  - load: 中等，等待所有资源')
  console.log('  - networkidle2: 最慢但最完整，适合 SPA')
}

/**
 * 获取服务压力状态
 */
async function getPressure(): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${BROWSERLESS_URL}/pressure`)
    if (response.ok) {
      return await response.json()
    }
  } catch {
    return null
  }
  return null
}

/**
 * 打印压力状态
 */
function printPressure(pressure: Record<string, unknown> | null): void {
  if (!pressure) {
    console.log('  (无法获取状态)')
    return
  }

  console.log(`  CPU: ${((pressure.cpu as number) || 0).toFixed(1)}%`)
  console.log(`  内存: ${((pressure.memory as number) || 0).toFixed(1)}%`)
  console.log(`  运行中: ${pressure.running || 0}/${pressure.maxConcurrent || 0}`)
  console.log(`  排队中: ${pressure.queued || 0}`)
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('='.repeat(60))
  console.log('Browserless 性能与并发测试')
  console.log('='.repeat(60))
  console.log(`服务地址: ${BROWSERLESS_URL}`)
  console.log('\n⚠️ 注意: 性能测试可能需要较长时间')

  try {
    await testSingleRequestBenchmark()
    await testConcurrentRequests()
    await testPressureMonitoring()
    await testTimeoutHandling()
    await testBatchStrategy()
    await testWaitUntilPerformance()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 所有测试完成')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    process.exit(1)
  }
}

main()
