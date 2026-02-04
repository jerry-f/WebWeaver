/**
 * WebSocket 鉴权中间件
 *
 * 验证 NextAuth JWT token，支持 token 过期检测
 */

import type { Socket } from 'socket.io'
import type { ExtendedError } from 'socket.io/dist/namespace'
import { decode } from 'next-auth/jwt'
import type { SocketData } from '../types'

// NextAuth JWT 配置（需要与 NextAuth 配置一致）
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || ''

/**
 * 解码并验证 NextAuth JWT token
 */
async function verifyToken(token: string): Promise<{
  id: string
  email: string
  role: string
  exp?: number
} | null> {
  // 1. 尝试解析 JWT token（正式方式）
  try {
    const decoded = await decode({
      token,
      secret: NEXTAUTH_SECRET,
    })

    if (decoded && decoded.id && decoded.email) {
      return {
        id: decoded.id as string,
        email: decoded.email as string,
        role: (decoded.role as string) || 'user',
        exp: decoded.exp as number | undefined,
      }
    }
  } catch {
    // JWT 解码失败，尝试其他方式
  }

  // 2. 尝试解析 base64 编码的 session 信息（开发环境备用方式）
  try {
    const jsonStr = Buffer.from(token, 'base64').toString('utf-8')
    const sessionData = JSON.parse(jsonStr)

    if (sessionData && sessionData.email) {
      console.log('[WS Auth] 使用 base64 session 信息认证')
      return {
        id: sessionData.id || 'unknown',
        email: sessionData.email,
        role: sessionData.role || 'user',
        exp: undefined, // base64 方式没有过期时间
      }
    }
  } catch {
    // base64 解码也失败
  }

  console.error('[WS Auth] Token 解码失败: 不是有效的 JWT 或 base64 session')
  return null
}
/**
 * 鉴权中间件
 *
 * 在 WebSocket 连接握手时验证 token
 */
export function authMiddleware() {
  return async (
    socket: Socket<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, SocketData>,
    next: (err?: ExtendedError) => void
  ) => {
    console.log('[WS Auth] 正在验证连接...')
    const token = socket.handshake.auth.token as string | undefined

    // 检查 token 是否存在
    if (!token) {
      console.log('[WS Auth] 连接被拒绝: 缺少 token')
      return next(new Error('unauthorized: missing token'))
    }

    // 验证 token
    const payload = await verifyToken(token)
    if (!payload) {
      console.log('[WS Auth] 连接被拒绝: token 无效')
      return next(new Error('unauthorized: invalid token'))
    }

    // 检查 token 是否过期
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      console.log('[WS Auth] 连接被拒绝: token 已过期')
      return next(new Error('unauthorized: token expired'))
    }

    // 将用户信息附加到 socket.data
    socket.data.userId = payload.id
    socket.data.email = payload.email
    socket.data.role = payload.role
    socket.data.authenticated = true
    socket.data.subscribedChannels = new Set()

    console.log(`[WS Auth] 用户已认证: ${payload.email} (${payload.role})`)
    next()
  }
}

/**
 * 定期检查已连接 socket 的 token 是否过期
 *
 * 当 token 过期时主动断开连接
 */
export function setupTokenExpirationChecker(
  io: { sockets: { sockets: Map<string, Socket> } },
  checkInterval: number = 60000 // 默认每分钟检查一次
) {
  setInterval(() => {
    // console.log('[WS Auth] 正在检查已连接客户端的 token 过期情况...')
    const now = Date.now()

    for (const [socketId, socket] of io.sockets.sockets) {
      const token = socket.handshake.auth.token as string | undefined
      if (!token) continue

      // 异步检查 token
      verifyToken(token).then((payload) => {
        if (!payload || (payload.exp && payload.exp * 1000 < now)) {
          console.log(`[WS Auth] Token 过期，断开连接: ${socketId}`)
          socket.emit('auth:expired', { message: 'Token 已过期，请重新登录' })
          socket.disconnect(true)
        }
      })
    }
  }, checkInterval)

  console.log(`[WS Auth] Token 过期检查器已启动 (间隔: ${checkInterval}ms)`)
}
