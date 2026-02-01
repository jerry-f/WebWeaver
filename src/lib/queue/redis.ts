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
