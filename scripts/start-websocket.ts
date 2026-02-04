#!/usr/bin/env npx tsx
/**
 * WebSocket 服务器独立启动脚本
 *
 * 用于分离部署场景，WebSocket 服务与 Web 服务分开运行
 *
 * 使用方式：
 *   npx tsx scripts/start-websocket.ts
 *
 * 环境变量：
 *   REDIS_URL          - Redis 连接地址（必需）
 *   WS_PORT            - WebSocket 端口（默认 3002）
 *   WS_PING_INTERVAL   - 心跳间隔（默认 25000ms）
 *   WS_PING_TIMEOUT    - 心跳超时（默认 20000ms）
 *   WS_CORS_ORIGIN     - 允许的 CORS 源（默认 http://localhost:3001）
 *   NEXTAUTH_SECRET    - NextAuth 密钥（必需，用于验证 token）
 */

import { createWebSocketServer, WebSocketServer } from '../src/lib/websocket/server'

let server: WebSocketServer | null = null

async function main() {
  console.log('========================================')
  console.log('  NewsFlow WebSocket 服务器')
  console.log('========================================')
  console.log(`端口: ${process.env.WS_PORT || 3002}`)
  console.log(`心跳间隔: ${process.env.WS_PING_INTERVAL || 25000}ms`)
  console.log(`心跳超时: ${process.env.WS_PING_TIMEOUT || 20000}ms`)
  console.log(`CORS 源: ${process.env.WS_CORS_ORIGIN || 'http://localhost:3001'}`)
  console.log('========================================\n')

  // 检查必需的环境变量
  if (!process.env.NEXTAUTH_SECRET) {
    console.warn('[WebSocket] 警告: NEXTAUTH_SECRET 未设置，鉴权可能失败')
  }

  // 启动 WebSocket 服务器
  console.log('[WebSocket] 正在启动...')
  server = await createWebSocketServer()

  console.log('\n[WebSocket] 服务已启动，等待连接...')
  console.log('[WebSocket] 按 Ctrl+C 停止\n')

  // 定期打印统计信息
  setInterval(() => {
    if (server) {
      const stats = server.getStats()
      if (stats.connectedClients > 0) {
        console.log(`[WebSocket] 当前连接数: ${stats.connectedClients}`)
      }
    }
  }, 60000) // 每分钟打印一次
}

// 优雅关闭
async function shutdown(signal: string) {
  console.log(`\n[WebSocket] 收到 ${signal} 信号，正在关闭...`)

  try {
    if (server) {
      await server.shutdown()
    }
    console.log('[WebSocket] 已安全关闭')
    process.exit(0)
  } catch (error) {
    console.error('[WebSocket] 关闭时出错:', error)
    process.exit(1)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('[WebSocket] 未捕获异常:', error)
  shutdown('uncaughtException')
})

process.on('unhandledRejection', (reason) => {
  console.error('[WebSocket] 未处理的 Promise 拒绝:', reason)
})

// 启动
main().catch((error) => {
  console.error('[WebSocket] 启动失败:', error)
  process.exit(1)
})
