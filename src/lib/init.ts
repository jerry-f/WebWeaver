/**
 * 应用初始化
 *
 * 在服务端启动时初始化各种服务
 */

import { initScheduler } from './tasks/scheduler'
import { startAllWorkers } from './queue/workers'

let initialized = false

/**
 * 初始化应用服务
 *
 * 包括：
 * - Cron 任务调度器
 * - BullMQ Workers
 */
export async function initApp(): Promise<void> {
  if (initialized) {
    return
  }

  // 仅在服务端运行
  if (typeof window !== 'undefined') {
    return
  }

  console.log('[Init] 初始化应用服务...')

  try {
    // 启动 Cron 调度器
    await initScheduler()

    // 启动 Workers（可选，根据环境变量控制）
    if (process.env.ENABLE_WORKERS === 'true') {
      startAllWorkers({ concurrency: 5 })
    }

    initialized = true
    console.log('[Init] 应用服务初始化完成')
  } catch (error) {
    console.error('[Init] 初始化失败:', error)
  }
}

/**
 * 检查是否已初始化
 */
export function isInitialized(): boolean {
  return initialized
}
