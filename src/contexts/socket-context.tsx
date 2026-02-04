'use client'

/**
 * Socket Context Provider
 *
 * 在应用层级提供 Socket.IO 连接上下文
 */

import React, { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'
import type {
  ConnectionStatus,
  ServerMessage,
  JobStatusPayload,
  QueueUpdatePayload,
  SubscriptionChannel,
} from '@/lib/websocket/types'

/**
 * Socket Context 值类型
 */
interface SocketContextValue {
  // 连接状态
  status: ConnectionStatus
  isConnected: boolean
  reconnectAttempts: number

  // 连接控制
  connect: () => void
  disconnect: () => void

  // 订阅管理
  subscribe: (channels: SubscriptionChannel[]) => void
  unsubscribe: (channels: SubscriptionChannel[]) => void

  // 事件监听（用于组件订阅特定事件）
  onJobStatus: (callback: (data: ServerMessage<JobStatusPayload>) => void) => () => void
  onQueueUpdate: (callback: (data: ServerMessage<QueueUpdatePayload>) => void) => () => void
}

const SocketContext = createContext<SocketContextValue | null>(null)

/**
 * Socket Provider Props
 */
interface SocketProviderProps {
  children: ReactNode
  autoConnect?: boolean
}

/**
 * Socket Provider
 */
export function SocketProvider({ children, autoConnect = false }: SocketProviderProps) {
  const { data: session, status: sessionStatus } = useSession()
  const socketRef = useRef<Socket | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  // 事件监听器
  const jobStatusListeners = useRef<Set<(data: ServerMessage<JobStatusPayload>) => void>>(new Set())
  const queueUpdateListeners = useRef<Set<(data: ServerMessage<QueueUpdatePayload>) => void>>(new Set())

  // 消息去重
  const processedMsgIds = useRef<Set<string>>(new Set())

  // 动态获取 WebSocket URL（基于当前页面的 hostname）
  const getWsUrl = useCallback(() => {
    if (process.env.NEXT_PUBLIC_WS_URL) {
      return process.env.NEXT_PUBLIC_WS_URL
    }
    if (typeof window !== 'undefined') {
      return `http://${window.location.hostname}:3002`
    }
    return 'http://localhost:3002'
  }, [])

  /**
   * 去重检查
   */
  const isProcessed = useCallback((msgId: string): boolean => {
    if (processedMsgIds.current.has(msgId)) {
      return true
    }
    processedMsgIds.current.add(msgId)
    if (processedMsgIds.current.size > 100) {
      const first = processedMsgIds.current.values().next().value
      if (first) {
        processedMsgIds.current.delete(first)
      }
    }
    return false
  }, [])

  /**
   * 连接
   */
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return
    if (sessionStatus !== 'authenticated') return

    // NextAuth cookie 名称可能不同：
    // - 开发环境 HTTP: next-auth.session-token
    // - 生产环境 HTTPS: __Secure-next-auth.session-token
    const cookieNames = [
      'next-auth.session-token',
      '__Secure-next-auth.session-token',
      '__Host-next-auth.session-token',
    ]

    let token: string | undefined
    for (const name of cookieNames) {
      const cookie = document.cookie
        .split('; ')
        .find((row) => row.startsWith(`${name}=`))
      if (cookie) {
        token = cookie.split('=').slice(1).join('=') // 处理 token 中可能包含 = 的情况
        console.log(`[Socket] 找到 cookie: ${name}`)
        break
      }
    }

    // 如果没找到 token，尝试使用 session 信息构建
    if (!token && session?.user) {
      // 构建 base64 编码的 session 信息作为备用
      token = btoa(JSON.stringify({
        id: (session.user as { id?: string }).id || 'unknown',
        email: session.user.email,
        role: (session.user as { role?: string }).role || 'user',
      }))
      console.log('[Socket] 使用 session 构建 token')
    }

    if (!token) return

    setConnectionStatus('connecting')
    const socketUrl = getWsUrl()
    console.log('[Socket] 连接到：', socketUrl)
    const socket = io(socketUrl, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 20000,
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => {
      setConnectionStatus('connected')
      setReconnectAttempts(0)
    })

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected')
    })

    socket.io.on('reconnect_attempt', (attempt) => {
      setConnectionStatus('reconnecting')
      setReconnectAttempts(attempt)
    })

    // 任务状态事件
    const jobEvents = ['job:started', 'job:progress', 'job:completed', 'job:failed'] as const
    jobEvents.forEach((event) => {
      socket.on(event, (data: ServerMessage<JobStatusPayload>) => {
        if (isProcessed(data.msgId)) return
        jobStatusListeners.current.forEach((cb) => cb(data))
      })
    })

    // 队列更新事件
    socket.on('queue:updated', (data: ServerMessage<QueueUpdatePayload>) => {
      if (isProcessed(data.msgId)) return
      queueUpdateListeners.current.forEach((cb) => cb(data))
    })

    // 服务重启事件
    socket.on('server:restart', () => {
      console.log('[Socket] 服务即将重启')
    })

    socketRef.current = socket
  }, [sessionStatus, getWsUrl, isProcessed])

  /**
   * 断开
   */
  const disconnect = useCallback(() => {
    console.log('[Socket] 正在断开连接...')
    socketRef.current?.disconnect()
    socketRef.current = null
    setConnectionStatus('disconnected')
  }, [])

  /**
   * 订阅
   */
  const subscribe = useCallback((channels: SubscriptionChannel[]) => {
    socketRef.current?.emit('subscribe', { channels })
  }, [])

  /**
   * 取消订阅
   */
  const unsubscribe = useCallback((channels: SubscriptionChannel[]) => {
    socketRef.current?.emit('unsubscribe', { channels })
  }, [])

  /**
   * 注册任务状态监听器
   */
  const onJobStatus = useCallback((callback: (data: ServerMessage<JobStatusPayload>) => void) => {
    jobStatusListeners.current.add(callback)
    return () => {
      jobStatusListeners.current.delete(callback)
    }
  }, [])

  /**
   * 注册队列更新监听器
   */
  const onQueueUpdate = useCallback((callback: (data: ServerMessage<QueueUpdatePayload>) => void) => {
    queueUpdateListeners.current.add(callback)
    return () => {
      queueUpdateListeners.current.delete(callback)
    }
  }, [])

  // 自动连接
  useEffect(() => {
    if (autoConnect && sessionStatus === 'authenticated') {
      connect()
    }
    return () => disconnect()
  }, [autoConnect, sessionStatus, connect, disconnect])

  const value: SocketContextValue = {
    status: connectionStatus,
    isConnected: connectionStatus === 'connected',
    reconnectAttempts,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    onJobStatus,
    onQueueUpdate,
  }

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

/**
 * 使用 Socket Context
 */
export function useSocketContext(): SocketContextValue {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocketContext must be used within a SocketProvider')
  }
  return context
}
