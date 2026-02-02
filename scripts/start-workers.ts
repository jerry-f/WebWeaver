#!/usr/bin/env npx tsx
/**
 * 独立 Worker 启动脚本
 *
 * 用于分离部署场景，Worker 与 Web 服务分开运行
 *
 * 使用方式：
 *   npx tsx scripts/start-workers.ts
 *
 * 环境变量：
 *   REDIS_URL          - Redis 连接地址（必需）
 *   DATABASE_URL       - 数据库连接地址（必需）
 *   WORKER_CONCURRENCY - Worker 并发数（默认 5）
 *   ENABLE_SCHEDULER   - 是否启用 Cron 调度器（默认 true）
 */

import { startAllWorkers, stopAllWorkers } from '../src/lib/queue/workers'
import { initScheduler, stopScheduler } from '../src/lib/tasks/scheduler'
import { loadDomainLimitsFromDB, loadCircuitBreakerFromDB } from '../src/lib/scheduler/domain-scheduler'
import { createRedisConnection, CHANNELS } from '../src/lib/queue/redis'

const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10)
const enableScheduler = process.env.ENABLE_SCHEDULER !== 'false'

// 配置重载订阅连接
let configSubscriber: ReturnType<typeof createRedisConnection> | null = null

async function main() {
  console.log('========================================')
  console.log('  NewsFlow Worker 独立进程')
  console.log('========================================')
  console.log(`并发数: ${concurrency}`)
  console.log(`调度器: ${enableScheduler ? '启用' : '禁用'}`)
  console.log('========================================\n')

  // 从数据库加载域名限速和熔断配置
  console.log('[Worker] 加载数据库配置...')
  await loadDomainLimitsFromDB()
  await loadCircuitBreakerFromDB()

  // 订阅配置变更通知
  await subscribeToConfigReload()

  // 启动 Cron 调度器（可选）
  if (enableScheduler) {
    console.log('[Worker] 启动 Cron 调度器...')
    await initScheduler()
  }

  // 启动所有 Workers
  console.log('[Worker] 启动 BullMQ Workers...')
  startAllWorkers({ concurrency })

  console.log('\n[Worker] 服务已启动，等待任务...')
  console.log('[Worker] 按 Ctrl+C 停止\n')
}

/**
 * 订阅配置重载通道
 */
async function subscribeToConfigReload() {
  configSubscriber = createRedisConnection()

  await configSubscriber.subscribe(CHANNELS.CONFIG_RELOAD)

  configSubscriber.on('message', async (channel, message) => {
    console.log(`[Worker] 收到配置重载消息: ${message}`)

    if (message === 'rate-limits') {
      await loadDomainLimitsFromDB()
    } else if (message === 'circuit-breaker') {
      await loadCircuitBreakerFromDB()
    }
  })

  console.log('[Worker] 已订阅配置重载通道')
}

// 优雅关闭
async function shutdown(signal: string) {
  console.log(`\n[Worker] 收到 ${signal} 信号，正在关闭...`)

  try {
    await stopScheduler()
    await stopAllWorkers()

    if (configSubscriber) {
      await configSubscriber.unsubscribe()
      await configSubscriber.quit()
    }

    console.log('[Worker] 已安全关闭')
    process.exit(0)
  } catch (error) {
    console.error('[Worker] 关闭时出错:', error)
    process.exit(1)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// 启动
main().catch((error) => {
  console.error('[Worker] 启动失败:', error)
  process.exit(1)
})
