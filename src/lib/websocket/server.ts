/**
 * Socket.IO 服务器
 *
 * 实时推送任务状态到前端
 */

import { Server as SocketIOServer, Socket } from 'socket.io'
import { createServer, Server as HttpServer } from 'http'
import { createAdapter } from '@socket.io/redis-adapter'
import { v4 as uuidv4 } from 'uuid'
import { createRedisConnection, CHANNELS } from '../queue/redis'
import type IORedis from 'ioredis'
import type {
  ServerMessage,
  ServerEventType,
  SocketData,
  SubscriptionChannel,
  JobStatusPayload,
  SubscribePayload,
} from './types'
import { authMiddleware, setupTokenExpirationChecker } from './middleware/auth'
import {
  connectionRateLimitMiddleware,
  createMessageRateLimiter,
  slowClientMiddleware,
} from './middleware/rate-limit'

/**
 * 服务器配置
 */
export interface WebSocketServerConfig {
  port: number
  pingInterval: number
  pingTimeout: number
  maxHttpBufferSize: number
  corsOrigin: string | string[]
}

const DEFAULT_CONFIG: WebSocketServerConfig = {
  port: parseInt(process.env.WS_PORT || '3002', 10),
  pingInterval: parseInt(process.env.WS_PING_INTERVAL || '25000', 10),
  pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '20000', 10),
  maxHttpBufferSize: 1024 * 1024, // 1MB
  // 支持多个 CORS 源：localhost 和局域网 IP
  corsOrigin: process.env.WS_CORS_ORIGIN?.split(',') || [
    'http://localhost:3001',
    'http://192.168.1.7:3001',
  ],
}

/**
 * WebSocket 服务器实例
 */
export class WebSocketServer {
  private httpServer: HttpServer
  private io: SocketIOServer
  private subscriber: IORedis
  private pubClient: IORedis
  private subClient: IORedis
  private messageSeq: number = 0
  private messageLimiter = createMessageRateLimiter()
  private config: WebSocketServerConfig

  constructor(config: Partial<WebSocketServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    // 创建 HTTP 服务器
    this.httpServer = createServer()

    // 创建 Socket.IO 服务器
    this.io = new SocketIOServer(this.httpServer, {
      pingInterval: this.config.pingInterval,
      pingTimeout: this.config.pingTimeout,
      maxHttpBufferSize: this.config.maxHttpBufferSize,
      cors: {
        origin: this.config.corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      // 支持 WebSocket 和轮询降级
      transports: ['websocket', 'polling'],
    })

    // Redis 连接
    this.subscriber = createRedisConnection()
    this.pubClient = createRedisConnection()
    this.subClient = this.pubClient.duplicate()

    // 配置 Redis Adapter（支持多实例）
    this.io.adapter(createAdapter(this.pubClient, this.subClient))
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    console.log('[WebSocket] 正在启动服务器...')
    // 注册中间件链
    this.setupMiddleware()

    // 注册事件处理
    this.setupEventHandlers()

    // 订阅 Redis 频道
    await this.subscribeToRedis()

    // 启动 Token 过期检查
    setupTokenExpirationChecker(this.io as unknown as { sockets: { sockets: Map<string, Socket> } })

    // 启动 HTTP 服务器
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, () => {
        console.log(`[WebSocket] 服务器已启动，端口: ${this.config.port}`)
        console.log(`[WebSocket] CORS 源: ${this.config.corsOrigin}`)
        resolve()
      })
    })
  }

  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    console.log('[WebSocket] 正在关闭...')

    // 通知所有客户端服务即将重启
    this.broadcast('server:restart', {
      message: '服务即将重启，请稍候...',
      reconnectDelay: 3000,
    })

    // 等待消息发送
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // 关闭 Socket.IO
    await new Promise<void>((resolve) => {
      this.io.close(() => resolve())
    })

    // 关闭 Redis 连接
    await this.subscriber.unsubscribe()
    await this.subscriber.quit()
    await this.pubClient.quit()
    await this.subClient.quit()

    // 关闭 HTTP 服务器
    await new Promise<void>((resolve) => {
      this.httpServer.close(() => resolve())
    })

    console.log('[WebSocket] 已关闭')
  }

  /**
   * 注册中间件
   */
  private setupMiddleware(): void {
    // 1. 连接限流
    this.io.use(connectionRateLimitMiddleware())

    // 2. 鉴权
    this.io.use(authMiddleware())

    // 3. 慢客户端检测
    this.io.use(slowClientMiddleware())

    console.log('[WebSocket] 中间件已注册')
  }

  /**
   * 注册事件处理器
   */
  private setupEventHandlers(): void {
    console.log('[WebSocket] 正在注册事件处理器...')
    this.io.on('connection', (socket: Socket<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, SocketData>) => {
      console.log(`[WebSocket] 客户端已连接: ${socket.id} (${socket.data.email})`)

      // 订阅频道
      socket.on('subscribe', (data: SubscribePayload) => {
        if (!this.messageLimiter.checkLimit(socket.id)) {
          socket.emit('error', { message: '消息频率超限' })
          return
        }

        for (const channel of data.channels) {
          socket.data.subscribedChannels.add(channel)
          socket.join(channel)
        }

        console.log(`[WebSocket] ${socket.data.email} 订阅了: ${data.channels.join(', ')}`)
      })

      // 取消订阅
      socket.on('unsubscribe', (data: SubscribePayload) => {
        for (const channel of data.channels) {
          socket.data.subscribedChannels.delete(channel)
          socket.leave(channel)
        }
      })

      // 断开连接
      socket.on('disconnect', (reason) => {
        console.log(`[WebSocket] 客户端断开: ${socket.id} (${reason})`)
        this.messageLimiter.cleanup(socket.id)
      })
    })
  }

  /**
   * 订阅 Redis Pub/Sub 频道
   */
  private async subscribeToRedis(): Promise<void> {
    console.log('[WebSocket] 正在订阅 Redis 频道...')
    await this.subscriber.subscribe(CHANNELS.JOB_STATUS)

    this.subscriber.on('message', (channel, message) => {
      if (channel === CHANNELS.JOB_STATUS) {
        try {
          const jobStatus = JSON.parse(message)
          this.handleJobStatus(jobStatus)
        } catch (error) {
          console.error('[WebSocket] 解析 Redis 消息失败:', error)
        }
      }
    })

    console.log('[WebSocket] 已订阅 Redis 频道')
  }

  /**
   * 处理任务状态消息
   */
  private handleJobStatus(jobStatus: {
    jobId: string
    sourceId: string
    type: string
    status: string
    progress?: { current: number; total: number; added?: number; queued?: number }
    error?: string
    timestamp: number
  }): void {
    // 转换状态为事件类型
    const eventType = `job:${jobStatus.status}` as ServerEventType

    const payload: JobStatusPayload = {
      jobId: jobStatus.jobId,
      sourceId: jobStatus.sourceId,
      jobType: jobStatus.type as JobStatusPayload['jobType'],
      queueName: this.getQueueNameFromType(jobStatus.type),
      progress: jobStatus.progress,
      error: jobStatus.error,
    }

    // 广播到 job:status 房间
    this.broadcastToRoom('job:status', eventType, payload)

    // 如果有 sourceId，也广播到特定源的房间
    if (jobStatus.sourceId) {
      this.broadcastToRoom(`source:${jobStatus.sourceId}` as SubscriptionChannel, eventType, payload)
    }
  }

  /**
   * 根据任务类型获取队列名称
   */
  private getQueueNameFromType(type: string): string {
    const mapping: Record<string, string> = {
      source_fetch: 'sourceFetch',
      crawl_discovery: 'sourceFetch',
      article_fetch: 'fetch',
      summary: 'summary',
      credential: 'credential',
    }
    return mapping[type] || 'unknown'
  }

  /**
   * 广播消息到所有客户端
   */
  broadcast<T>(type: ServerEventType, payload: T): void {
    const message = this.createMessage(type, payload)
    this.io.emit(type, message)
  }

  /**
   * 广播消息到指定房间
   */
  broadcastToRoom<T>(room: SubscriptionChannel, type: ServerEventType, payload: T): void {
    const message = this.createMessage(type, payload)
    this.io.to(room).emit(type, message)
  }

  /**
   * 创建标准消息格式
   */
  private createMessage<T>(type: ServerEventType, payload: T): ServerMessage<T> {
    return {
      msgId: uuidv4(),
      seq: ++this.messageSeq,
      timestamp: Date.now(),
      type,
      payload,
    }
  }

  /**
   * 获取连接统计
   */
  getStats(): { connectedClients: number; rooms: string[] } {
    return {
      connectedClients: this.io.sockets.sockets.size,
      rooms: Array.from(this.io.sockets.adapter.rooms.keys()),
    }
  }
}

/**
 * 创建并启动 WebSocket 服务器
 */
export async function createWebSocketServer(
  config: Partial<WebSocketServerConfig> = {}
): Promise<WebSocketServer> {
  console.log('[WebSocket] 正在创建服务器...')
  const server = new WebSocketServer(config)
  await server.start()
  return server
}
