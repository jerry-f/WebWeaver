'use client'

/**
 * Socket.IO Hook
 *
 * 提供 WebSocket 连接管理、消息处理、自动重连等功能
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useSession } from 'next-auth/react'
import type {
  ConnectionStatus,
  ServerMessage,
  ServerEventType,
  SubscriptionChannel,
  JobStatusPayload,
  QueueUpdatePayload,
  ServerRestartPayload,
} from '@/lib/websocket/types'

/**
 * Socket.IO 配置
 */
interface SocketConfig {
  url: string
  autoConnect: boolean
  reconnection: boolean
  reconnectionAttempts: number
  reconnectionDelay: number
  reconnectionDelayMax: number
  randomizationFactor: number
  timeout: number
}

/**
 * 动态获取 WebSocket URL
 * 根据当前页面的 host 自动选择 WebSocket 服务器地址
 */
function getWebSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL
  }

  // 在浏览器环境下，使用当前页面的 hostname
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    return `http://${hostname}:3002`
  }

  return 'http://localhost:3002'
}

const DEFAULT_CONFIG: SocketConfig = {
  url: getWebSocketUrl(),
  autoConnect: false, // 手动连接，等待 token
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
  randomizationFactor: 0.5,
  timeout: 20000,
}

/**
 * 消息去重配置
 */
const DEDUP_WINDOW_SIZE = 100 // 保留最近 100 条消息 ID

/**
 * 事件回调类型
 */
export interface SocketEventCallbacks {
  onJobStarted?: (data: ServerMessage<JobStatusPayload>) => void
  onJobProgress?: (data: ServerMessage<JobStatusPayload>) => void
  onJobCompleted?: (data: ServerMessage<JobStatusPayload>) => void
  onJobFailed?: (data: ServerMessage<JobStatusPayload>) => void
  onQueueUpdated?: (data: ServerMessage<QueueUpdatePayload>) => void
  onServerRestart?: (data: ServerMessage<ServerRestartPayload>) => void
  onConnect?: () => void
  onDisconnect?: (reason: string) => void
  onError?: (error: Error) => void
}

/**
 * Hook 返回值
 */
export interface UseSocketReturn {
  status: ConnectionStatus
  reconnectAttempts: number
  connect: () => void
  disconnect: () => void
  subscribe: (channels: SubscriptionChannel[]) => void
  unsubscribe: (channels: SubscriptionChannel[]) => void
  isConnected: boolean
}

/**
 * Socket.IO Hook
 */
export function useSocket(
  callbacks: SocketEventCallbacks = {},
  config: Partial<SocketConfig> = {}
): UseSocketReturn {
  const { data: session, status: sessionStatus } = useSession()
  const socketRef = useRef<Socket | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  // 消息去重窗口
  const processedMsgIds = useRef<Set<string>>(new Set())

  // 合并配置
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  /**
   * 检查消息是否已处理（去重）
   */
  const isMessageProcessed = useCallback((msgId: string): boolean => {
    if (processedMsgIds.current.has(msgId)) {
      return true
    }

    // 添加到已处理集合
    processedMsgIds.current.add(msgId)

    // 限制集合大小
    if (processedMsgIds.current.size > DEDUP_WINDOW_SIZE) {
      const iterator = processedMsgIds.current.values()
      processedMsgIds.current.delete(iterator.next().value)
    }

    return false
  }, [])

  /**
   * 创建消息处理器（带去重）
   */
  const createHandler = useCallback(
    <T>(callback?: (data: ServerMessage<T>) => void) => {
      return (data: ServerMessage<T>) => {
        // 去重检查
        if (isMessageProcessed(data.msgId)) {
          return
        }

        callback?.(data)
      }
    },
    [isMessageProcessed]
  )

  /**
   * 连接 Socket
   */
  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return
    }

    // 需要认证 token
    if (sessionStatus !== 'authenticated' || !session) {
      console.log('[Socket] 等待认证...')
      return
    }

    // 获取 session token（尝试多种可能的 cookie 名称）
    const cookies = document.cookie.split('; ')
    let token = cookies
      .find((row) => row.startsWith('next-auth.session-token='))
      ?.split('=')[1]

    // 生产环境/HTTPS 下的 cookie 名称
    if (!token) {
      token = cookies
        .find((row) => row.startsWith('__Secure-next-auth.session-token='))
        ?.split('=')[1]
    }

    // 如果还是找不到，尝试使用 session 本身（虽然不是 JWT token，但可以作为标识）
    if (!token && session?.user) {
      // 使用一个临时方案：将 session 信息编码为 token
      // 注意：这不是最佳实践，但可以用于开发测试
      console.log('[Socket] 使用 session 信息作为认证')
      token = btoa(JSON.stringify({
        id: (session.user as { id?: string }).id,
        email: session.user.email,
        role: (session.user as { role?: string }).role
      }))
    }

    if (!token) {
      console.log('[Socket] 未找到有效的认证信息')
      return
    }

    setConnectionStatus('connecting')

    const socket = io(finalConfig.url, {
      auth: { token },
      reconnection: finalConfig.reconnection,
      reconnectionAttempts: finalConfig.reconnectionAttempts,
      reconnectionDelay: finalConfig.reconnectionDelay,
      reconnectionDelayMax: finalConfig.reconnectionDelayMax,
      randomizationFactor: finalConfig.randomizationFactor,
      timeout: finalConfig.timeout,
      transports: ['websocket', 'polling'],
    })

    // 连接成功
    socket.on('connect', () => {
      console.log('[Socket] 已连接')
      setConnectionStatus('connected')
      setReconnectAttempts(0)
      callbacks.onConnect?.()
    })

    // 断开连接
    socket.on('disconnect', (reason) => {
      console.log('[Socket] 已断开:', reason)
      setConnectionStatus('disconnected')
      callbacks.onDisconnect?.(reason)
    })

    // 重连中
    socket.io.on('reconnect_attempt', (attempt) => {
      console.log('[Socket] 重连尝试:', attempt)
      setConnectionStatus('reconnecting')
      setReconnectAttempts(attempt)
    })

    // 重连失败
    socket.io.on('reconnect_failed', () => {
      console.log('[Socket] 重连失败')
      setConnectionStatus('disconnected')
    })

    // 连接错误
    socket.on('connect_error', (error) => {
      console.error('[Socket] 连接错误:', error.message)
      callbacks.onError?.(error)
    })

    // Token 过期
    socket.on('auth:expired', () => {
      console.log('[Socket] Token 已过期')
      setConnectionStatus('disconnected')
      socket.disconnect()
    })

    // 注册事件处理器
    socket.on('job:started', createHandler(callbacks.onJobStarted))
    socket.on('job:progress', createHandler(callbacks.onJobProgress))
    socket.on('job:completed', createHandler(callbacks.onJobCompleted))
    socket.on('job:failed', createHandler(callbacks.onJobFailed))
    socket.on('queue:updated', createHandler(callbacks.onQueueUpdated))
    socket.on('server:restart', createHandler(callbacks.onServerRestart))

    socketRef.current = socket
  }, [session, sessionStatus, finalConfig, callbacks, createHandler])

  /**
   * 断开连接
   */
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
      setConnectionStatus('disconnected')
    }
  }, [])

  /**
   * 订阅频道
   */
  const subscribe = useCallback((channels: SubscriptionChannel[]) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { channels })
    }
  }, [])

  /**
   * 取消订阅
   */
  const unsubscribe = useCallback((channels: SubscriptionChannel[]) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe', { channels })
    }
  }, [])

  // 自动连接（当 session 就绪时）
  useEffect(() => {
    if (sessionStatus === 'authenticated' && finalConfig.autoConnect) {
      connect()
    }

    // 只在组件卸载时断开，不在依赖变化时断开
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, finalConfig.autoConnect])

  // 组件卸载时断开连接
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [])

  return {
    status: connectionStatus,
    reconnectAttempts,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    isConnected: connectionStatus === 'connected',
  }
}

/**
 * 专门用于队列管理页面的 Hook
 */
export function useQueueSocket(callbacks: SocketEventCallbacks = {}): UseSocketReturn & {
  subscribeToJobStatus: () => void
} {
  const socket = useSocket(callbacks, { autoConnect: true })

  const subscribeToJobStatus = useCallback(() => {
    socket.subscribe(['job:status', 'queue:stats'])
  }, [socket])

  // 连接后自动订阅
  useEffect(() => {
    if (socket.isConnected) {
      subscribeToJobStatus()
    }
  }, [socket.isConnected, subscribeToJobStatus])

  return {
    ...socket,
    subscribeToJobStatus,
  }
}
