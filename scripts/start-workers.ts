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

const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10)
const enableScheduler = process.env.ENABLE_SCHEDULER !== 'false'

async function main() {
  console.log('========================================')
  console.log('  NewsFlow Worker 独立进程')
  console.log('========================================')
  console.log(`并发数: ${concurrency}`)
  console.log(`调度器: ${enableScheduler ? '启用' : '禁用'}`)
  console.log('========================================\n')

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

// 优雅关闭
async function shutdown(signal: string) {
  console.log(`\n[Worker] 收到 ${signal} 信号，正在关闭...`)

  try {
    stopScheduler()
    await stopAllWorkers()
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
