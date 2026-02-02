#!/usr/bin/env npx tsx
/**
 * 独立 Cron 调度器启动脚本
 *
 * 用于分离部署场景，调度器与 Web 服务分开运行
 *
 * 使用方式：
 *   npx tsx scripts/start-scheduler.ts
 *
 * 环境变量：
 *   REDIS_URL     - Redis 连接地址（必需，用于推送任务到队列）
 *   DATABASE_URL  - 数据库连接地址（必需，读取 Task 配置和 Source 列表）
 */

import { initScheduler, stopScheduler, getSchedulerStatus } from '../src/lib/tasks/scheduler'

async function main() {
  console.log('========================================')
  console.log('  NewsFlow Cron 调度器 独立进程')
  console.log('========================================')
  console.log(`启动时间: ${new Date().toLocaleString()}`)
  console.log('========================================\n')

  // 启动 Cron 调度器
  console.log('[Scheduler] 正在初始化...')
  await initScheduler()

  // 打印状态
  const status = getSchedulerStatus()
  console.log(`[Scheduler] 已加载 ${status.taskCount} 个定时任务`)
  console.log('[Scheduler] 任务列表:', status.tasks)

  console.log('\n[Scheduler] 服务已启动，等待定时触发...')
  console.log('[Scheduler] 按 Ctrl+C 停止\n')

  // 保持进程活跃（即使没有定时任务时也不退出）
  process.stdin.resume()
}

// 优雅关闭
async function shutdown(signal: string) {
  console.log(`\n[Scheduler] 收到 ${signal} 信号，正在关闭...`)

  try {
    await stopScheduler()
    console.log('[Scheduler] 已安全关闭')
    process.exit(0)
  } catch (error) {
    console.error('[Scheduler] 关闭时出错:', error)
    process.exit(1)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// 启动
main().catch((error) => {
  console.error('[Scheduler] 启动失败:', error)
  process.exit(1)
})
