/**
 * WebSocket 消息类型定义
 *
 * 包含服务端和客户端的消息结构、事件类型等
 */

// ============================================================
// 服务端 → 客户端 消息
// ============================================================

/**
 * 服务端事件类型
 */
export type ServerEventType =
  | 'job:started'      // 任务开始
  | 'job:progress'     // 任务进度更新
  | 'job:completed'    // 任务完成
  | 'job:failed'       // 任务失败
  | 'queue:updated'    // 队列状态变化
  | 'server:restart'   // 服务即将重启（优雅下线通知）

/**
 * 服务端消息基础结构（支持去重、排序）
 */
export interface ServerMessage<T = unknown> {
  msgId: string        // UUID，用于客户端去重
  seq: number          // 递增序号，用于排序
  timestamp: number    // 服务端时间戳
  type: ServerEventType // 事件类型
  payload: T           // 业务数据
}

/**
 * 任务类型
 */
export type JobType =
  | 'source_fetch'     // 源抓取（RSS/列表）
  | 'article_fetch'    // 文章内容抓取
  | 'crawl_discovery'  // 爬虫发现
  | 'summary'          // AI 摘要
  | 'credential'       // 凭证刷新

/**
 * 任务状态 Payload
 */
export interface JobStatusPayload {
  jobId: string
  sourceId?: string
  jobType: JobType
  queueName: string
  progress?: {
    current: number
    total: number
    added?: number    // 新增文章数
    queued?: number   // 入队任务数
  }
  error?: string       // 失败时的错误信息
  duration?: number    // 完成时的耗时（毫秒）
}

/**
 * 队列更新 Payload
 */
export interface QueueUpdatePayload {
  queueKey: string     // 队列标识（如 sourceFetch, fetch, summary）
  waiting: number
  active: number
  completed: number
  failed: number
  paused: boolean
}

/**
 * 服务重启 Payload
 */
export interface ServerRestartPayload {
  message: string
  reconnectDelay?: number  // 建议的重连延迟（毫秒）
}

// ============================================================
// 客户端 → 服务端 消息
// ============================================================

/**
 * 客户端事件类型
 */
export type ClientEventType =
  | 'auth'           // 认证
  | 'subscribe'      // 订阅频道
  | 'unsubscribe'    // 取消订阅

/**
 * 可订阅的频道
 */
export type SubscriptionChannel =
  | 'job:status'     // 所有任务状态
  | 'queue:stats'    // 队列统计
  | `source:${string}` // 特定源的更新

/**
 * 认证请求
 */
export interface AuthPayload {
  token: string
}

/**
 * 订阅请求
 */
export interface SubscribePayload {
  channels: SubscriptionChannel[]
}

// ============================================================
// Socket 数据类型（附加在 socket.data 上）
// ============================================================

/**
 * Socket 连接数据
 */
export interface SocketData {
  userId: string
  email: string
  role: string
  authenticated: boolean
  subscribedChannels: Set<SubscriptionChannel>
}

// ============================================================
// 辅助类型
// ============================================================

/**
 * 消息去重窗口配置
 */
export interface DeduplicationConfig {
  windowSize: number    // 滑动窗口大小（保留最近 N 条消息 ID）
  maxAge: number        // 最大保留时间（毫秒）
}

/**
 * 连接状态
 */
export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'authenticated'
  | 'disconnected'
  | 'reconnecting'

/**
 * 前端 Hook 返回的状态
 */
export interface SocketState {
  status: ConnectionStatus
  lastSeq: number
  reconnectAttempts: number
}
