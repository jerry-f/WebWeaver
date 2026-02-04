/**
 * WebSocket 限流中间件
 *
 * 防止 DoS 攻击和消息滥用
 */

import type { Socket } from 'socket.io'
import type { ExtendedError } from 'socket.io/dist/namespace'
import type { SocketData } from '../types'

/**
 * 限流配置
 */
interface RateLimitConfig {
  // 每秒最大消息数
  maxMessagesPerSecond: number
  // 每分钟最大连接数（同一 IP）
  maxConnectionsPerMinute: number
  // 消息大小限制（字节）
  maxMessageSize: number
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxMessagesPerSecond: 10,
  maxConnectionsPerMinute: 30,
  maxMessageSize: 1024 * 100, // 100KB
}

// IP -> 连接时间戳数组
const connectionAttempts = new Map<string, number[]>()

// socketId -> 消息时间戳数组
const messageTimestamps = new Map<string, number[]>()

/**
 * 清理过期的记录
 */
function cleanupExpiredRecords() {
  const now = Date.now()

  // 清理连接记录（保留最近 1 分钟）
  for (const [ip, timestamps] of connectionAttempts) {
    const recent = timestamps.filter((t) => now - t < 60000)
    if (recent.length === 0) {
      connectionAttempts.delete(ip)
    } else {
      connectionAttempts.set(ip, recent)
    }
  }

  // 清理消息记录（保留最近 1 秒）
  for (const [socketId, timestamps] of messageTimestamps) {
    const recent = timestamps.filter((t) => now - t < 1000)
    if (recent.length === 0) {
      messageTimestamps.delete(socketId)
    } else {
      messageTimestamps.set(socketId, recent)
    }
  }
}

// 每 30 秒清理一次
setInterval(cleanupExpiredRecords, 30000)

/**
 * 连接限流中间件
 *
 * 限制同一 IP 的连接频率
 */
export function connectionRateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const { maxConnectionsPerMinute } = { ...DEFAULT_CONFIG, ...config }

  return (
    socket: Socket<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, SocketData>,
    next: (err?: ExtendedError) => void
  ) => {
    const ip = socket.handshake.address
    const now = Date.now()

    // 获取该 IP 最近的连接记录
    const attempts = connectionAttempts.get(ip) || []
    const recentAttempts = attempts.filter((t) => now - t < 60000)

    if (recentAttempts.length >= maxConnectionsPerMinute) {
      console.log(`[WS RateLimit] 连接被拒绝: ${ip} 超过连接限制 (${recentAttempts.length}/${maxConnectionsPerMinute}/min)`)
      return next(new Error('rate limit exceeded: too many connections'))
    }

    // 记录本次连接
    recentAttempts.push(now)
    connectionAttempts.set(ip, recentAttempts)

    next()
  }
}

/**
 * 消息限流器
 *
 * 限制单个连接的消息发送频率
 */
export function createMessageRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const { maxMessagesPerSecond } = { ...DEFAULT_CONFIG, ...config }

  return {
    /**
     * 检查是否允许发送消息
     */
    checkLimit(socketId: string): boolean {
      const now = Date.now()
      const timestamps = messageTimestamps.get(socketId) || []
      const recentMessages = timestamps.filter((t) => now - t < 1000)

      if (recentMessages.length >= maxMessagesPerSecond) {
        return false
      }

      recentMessages.push(now)
      messageTimestamps.set(socketId, recentMessages)
      return true
    },

    /**
     * 清理 socket 断开后的记录
     */
    cleanup(socketId: string): void {
      messageTimestamps.delete(socketId)
    },
  }
}

/**
 * 慢客户端检测中间件
 *
 * 检测发送缓冲区积压过多的客户端并断开连接
 */
export function slowClientMiddleware(maxBufferSize: number = 100) {
  return (
    socket: Socket,
    next: (err?: ExtendedError) => void
  ) => {
    // 监听发送缓冲区
    const conn = socket.conn
    if (conn) {
      conn.on('packetCreate', () => {
        if (conn.writeBuffer && conn.writeBuffer.length > maxBufferSize) {
          console.log(`[WS RateLimit] 慢客户端检测: ${socket.id} 缓冲区积压 ${conn.writeBuffer.length}，断开连接`)
          socket.disconnect(true)
        }
      })
    }

    next()
  }
}
