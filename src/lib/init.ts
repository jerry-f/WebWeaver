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
    // 启动 Cron 调度器（默认启用，可通过环境变量禁用）
    // 禁用场景：分离部署时，调度器单独运行
    if (process.env.DISABLE_SCHEDULER !== 'true') {
      await initScheduler()
      console.log('[Init] Cron 调度器已启动')
    } else {
      console.log('[Init] 调度器已禁用（DISABLE_SCHEDULER=true）')
    }

    // 启动 Workers（默认启用，可通过环境变量禁用）
    // 禁用场景：分离部署时，Workers 单独运行
    if (process.env.DISABLE_WORKERS !== 'true') {
      startAllWorkers({ concurrency: 5 })
      console.log('[Init] BullMQ Workers 已启动')
    } else {
      console.log('[Init] Workers 已禁用（DISABLE_WORKERS=true）')
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
