/**
 * Redis 连接配置
 *
 * 用于 BullMQ 任务队列
 */

import IORedis from 'ioredis'

/**
 * Redis 连接配置
 */
export interface RedisConfig {
  host: string
  port: number
  password?: string
  db?: number
  maxRetriesPerRequest?: number | null
}

/**
 * 默认 Redis 配置
 */
const DEFAULT_CONFIG: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetriesPerRequest: null // BullMQ 要求
}

/**
 * 创建 Redis 连接
 */
export function createRedisConnection(config: Partial<RedisConfig> = {}): IORedis {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  return new IORedis({
    host: cfg.host,
    port: cfg.port,
    password: cfg.password,
    db: cfg.db,
    maxRetriesPerRequest: cfg.maxRetriesPerRequest,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      if (times > 3) {
        return null // 停止重试
      }
      return Math.min(times * 200, 2000)
    }
  })
}

/**
 * 默认连接实例（懒加载）
 */
let defaultConnection: IORedis | null = null

/**
 * 获取默认 Redis 连接
 */
export function getRedisConnection(): IORedis {
  if (!defaultConnection) {
    defaultConnection = createRedisConnection()
  }
  return defaultConnection
}

/**
 * 关闭默认连接
 */
export async function closeRedisConnection(): Promise<void> {
  if (defaultConnection) {
    await defaultConnection.quit()
    defaultConnection = null
  }
}

// ============ Pub/Sub 通道定义 ============

/**
 * Pub/Sub 通道名称
 */
export const CHANNELS = {
  SCHEDULER_RELOAD: 'newsflow:scheduler:reload',
  SCHEDULER_RELOAD_ALL: 'newsflow:scheduler:reload-all',
  CONFIG_RELOAD: 'newsflow:config:reload'
} as const

/**
 * 发布任务重载消息
 * 用于通知 Scheduler 进程重新加载指定任务
 */
export async function publishTaskReload(taskId: string): Promise<void> {
  const redis = getRedisConnection()
  await redis.publish(CHANNELS.SCHEDULER_RELOAD, taskId)
  console.log(`[Redis] 已发布任务重载消息: ${taskId}`)
}

/**
 * 发布全部重载消息
 */
export async function publishReloadAll(): Promise<void> {
  const redis = getRedisConnection()
  await redis.publish(CHANNELS.SCHEDULER_RELOAD_ALL, 'reload')
  console.log('[Redis] 已发布全部任务重载消息')
}

/**
 * 发布配置重载消息
 * 用于通知 Worker 进程重新加载域名限速/熔断配置
 */
export async function publishConfigReload(configType: string): Promise<void> {
  const redis = getRedisConnection()
  await redis.publish(CHANNELS.CONFIG_RELOAD, configType)
  console.log(`[Redis] 已发布配置重载消息: ${configType}`)
}
