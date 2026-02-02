/**
 * Cron 调度器
 *
 * 从数据库读取定时任务配置，使用 node-cron 调度执行
 */

import cron, { type ScheduledTask } from 'node-cron'
import { prisma } from '../prisma'
import { getCredentialQueue } from '../queue/queues'

// 存储已注册的 cron 任务
const scheduledTasks: Map<string, ScheduledTask> = new Map()

// 调度器是否已初始化
let initialized = false

/**
 * 任务类型枚举
 */
export const TASK_TYPES = {
  FETCH: 'FETCH',
  SUMMARIZE: 'SUMMARIZE',
  PUSH: 'PUSH',
  CLEANUP: 'CLEANUP',
  REFRESH_CREDENTIALS: 'REFRESH_CREDENTIALS'
} as const

export type TaskType = (typeof TASK_TYPES)[keyof typeof TASK_TYPES]

/**
 * 初始化调度器
 * 在应用启动时调用
 */
export async function initScheduler(): Promise<void> {
  if (initialized) {
    console.log('[Scheduler] 调度器已初始化，跳过')
    return
  }

  console.log('[Scheduler] 初始化任务调度器...')

  try {
    // 从数据库加载启用的任务
    const tasks = await prisma.task.findMany({
      where: { enabled: true }
    })

    for (const task of tasks) {
      scheduleTask(task)
    }

    initialized = true
    console.log(`[Scheduler] 已加载 ${tasks.length} 个定时任务`)
  } catch (error) {
    console.error('[Scheduler] 初始化失败:', error)
  }
}

/**
 * 注册单个任务
 */
function scheduleTask(task: { id: string; name: string; type: string; schedule: string }): void {
  // 验证 cron 表达式
  if (!cron.validate(task.schedule)) {
    console.error(`[Scheduler] 无效的 cron 表达式: ${task.schedule} (任务: ${task.name})`)
    return
  }

  // 如果任务已存在，先停止
  if (scheduledTasks.has(task.id)) {
    scheduledTasks.get(task.id)?.stop()
    scheduledTasks.delete(task.id)
  }

  const scheduledTask = cron.schedule(task.schedule, async () => {
    console.log(`[Scheduler] 触发任务: ${task.name} (${task.type})`)

    try {
      // 根据任务类型推送到对应队列
      switch (task.type) {
        case TASK_TYPES.REFRESH_CREDENTIALS:
          await getCredentialQueue().add('refresh-all', { taskId: task.id })
          break

        // 其他任务类型可以在这里添加
        default:
          console.warn(`[Scheduler] 未知任务类型: ${task.type}`)
      }

      // 更新任务状态
      await prisma.task.update({
        where: { id: task.id },
        data: {
          lastRun: new Date(),
          lastStatus: 'running'
        }
      })
    } catch (error) {
      console.error(`[Scheduler] 任务触发失败: ${task.name}`, error)
      await prisma.task.update({
        where: { id: task.id },
        data: {
          lastStatus: 'failed',
          lastError: error instanceof Error ? error.message : 'Unknown error'
        }
      })
    }
  })

  scheduledTasks.set(task.id, scheduledTask)
  console.log(`[Scheduler] 已注册任务: ${task.name} (${task.schedule})`)
}

/**
 * 重新加载单个任务
 */
export async function reloadTask(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId }
  })

  if (!task) {
    // 任务已删除，停止调度
    if (scheduledTasks.has(taskId)) {
      scheduledTasks.get(taskId)?.stop()
      scheduledTasks.delete(taskId)
      console.log(`[Scheduler] 已移除任务: ${taskId}`)
    }
    return
  }

  if (task.enabled) {
    scheduleTask(task)
  } else {
    // 任务已禁用
    if (scheduledTasks.has(taskId)) {
      scheduledTasks.get(taskId)?.stop()
      scheduledTasks.delete(taskId)
      console.log(`[Scheduler] 已禁用任务: ${task.name}`)
    }
  }
}

/**
 * 重新加载所有任务
 */
export async function reloadAllTasks(): Promise<void> {
  console.log('[Scheduler] 重新加载所有任务...')
  stopScheduler()
  initialized = false
  await initScheduler()
}

/**
 * 停止所有任务
 */
export function stopScheduler(): void {
  for (const [id, task] of scheduledTasks) {
    task.stop()
  }
  scheduledTasks.clear()
  console.log('[Scheduler] 所有任务已停止')
}

/**
 * 获取调度器状态
 */
export function getSchedulerStatus(): {
  initialized: boolean
  taskCount: number
  tasks: string[]
} {
  return {
    initialized,
    taskCount: scheduledTasks.size,
    tasks: Array.from(scheduledTasks.keys())
  }
}

/**
 * 手动触发任务
 */
export async function triggerTask(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId }
  })

  if (!task) {
    throw new Error(`任务不存在: ${taskId}`)
  }

  console.log(`[Scheduler] 手动触发任务: ${task.name}`)

  switch (task.type) {
    case TASK_TYPES.REFRESH_CREDENTIALS:
      await getCredentialQueue().add('refresh-all', { taskId: task.id, manual: true })
      break

    default:
      throw new Error(`不支持手动触发的任务类型: ${task.type}`)
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      lastRun: new Date(),
      lastStatus: 'running'
    }
  })
}
