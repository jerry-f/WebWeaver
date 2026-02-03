/**
 * Go 抓取服务 gRPC 客户端
 *
 * 通过 gRPC 协议与 Go 抓取服务通信
 * 比 REST 快 7-10 倍
 */

import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import path from 'path'
import type {
  FetchResponse,
  FetchRawResponse,
  HealthResponse,
  Image as ProtoImage,
  FetchOptions as ProtoFetchOptions,
} from './scraper'

// gRPC 服务客户端接口（proto-loader 动态加载）
interface ScraperServiceClient extends grpc.Client {
  FetchArticle(
    request: { url: string; options?: Partial<ProtoFetchOptions> },
    options: { deadline: Date },
    callback: (err: grpc.ServiceError | null, response: FetchResponse) => void
  ): grpc.ClientUnaryCall

  FetchRaw(
    request: { url: string; options?: Partial<ProtoFetchOptions> },
    options: { deadline: Date },
    callback: (err: grpc.ServiceError | null, response: FetchRawResponse) => void
  ): grpc.ClientUnaryCall

  HealthCheck(
    request: Record<string, never>,
    options: { deadline: Date },
    callback: (err: grpc.ServiceError | null, response: HealthResponse) => void
  ): grpc.ClientUnaryCall
}

interface ScraperProtoDefinition {
  scraper: {
    ScraperService: grpc.ServiceClientConstructor
  }
}

/**
 * gRPC 客户端配置
 */
export interface GrpcClientConfig {
  /** gRPC 服务地址 */
  address?: string
  /** 连接超时（毫秒） */
  timeout?: number
}

/**
 * 抓取选项
 */
export interface GrpcFetchOptions {
  /** 超时时间（毫秒） */
  timeoutMs?: number
  /** 是否提取全文 */
  extractFulltext?: boolean
  /** 是否处理图片 */
  processImages?: boolean
  /** 图片代理基础 URL */
  imageProxyBase?: string
  /** 自定义请求头 */
  headers?: Record<string, string>
  /** 抓取策略 */
  strategy?: 'auto' | 'cycletls' | 'standard'
  /** Referer */
  referer?: string
}

/**
 * 图片信息
 */
export interface GrpcImage {
  originalUrl: string
  proxyUrl: string
  alt: string
  isLazy: boolean
}

/**
 * 抓取响应
 */
export interface GrpcFetchResponse {
  url: string
  finalUrl: string
  title: string
  content: string
  textContent: string
  excerpt: string
  byline: string
  siteName: string
  images: GrpcImage[]
  readingTime: number
  strategy: string
  durationMs: number
  error: string
}

/**
 * 健康检查响应
 */
export interface GrpcHealthResponse {
  status: string
  maxConcurrent: number
  available: number
  cycletlsEnabled: boolean
}

/**
 * 原始抓取响应（不经过 Readability 处理）
 */
export interface GrpcRawResponse {
  url: string
  finalUrl: string
  body: string
  contentType: string
  statusCode: number
  strategy: string
  durationMs: number
  error: string
}

// Proto 文件路径
const PROTO_PATH = path.join(
  process.cwd(),
  'go-scraper-service/api/proto/scraper.proto'
)

/**
 * Go 抓取服务 gRPC 客户端
 */
export class GoScraperGrpcClient {
  private client: ScraperServiceClient | null = null
  private connected: boolean = false

  constructor(config: GrpcClientConfig = {}) {
    const address = config.address || process.env.GO_SCRAPER_GRPC_URL || 'localhost:50051'

    try {
      // 加载 proto 文件
      const packageDef = protoLoader.loadSync(PROTO_PATH, {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      })

      const proto = grpc.loadPackageDefinition(packageDef) as unknown as ScraperProtoDefinition

      // 创建客户端
      this.client = new proto.scraper.ScraperService(
        address,
        grpc.credentials.createInsecure(),
        {
          'grpc.max_receive_message_length': 50 * 1024 * 1024, // 50MB
          'grpc.max_send_message_length': 10 * 1024 * 1024 // 10MB
        }
      ) as unknown as ScraperServiceClient

      this.connected = true
      console.log(`[GoScraperGrpc] Connected to ${address}`)
    } catch (error) {
      console.error('[GoScraperGrpc] Failed to connect:', error)
      this.connected = false
    }
  }

  /**
   * 检查客户端是否已连接
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * 抓取单个文章
   */
  async fetchArticle(
    url: string,
    options?: GrpcFetchOptions
  ): Promise<GrpcFetchResponse> {
    if (!this.connected) {
      throw new Error('gRPC client not connected')
    }

    return new Promise((resolve, reject) => {
      const request = {
        url,
        options: options
          ? {
              timeoutMs: options.timeoutMs || 15000,
              extractFulltext: options.extractFulltext ?? true,
              processImages: options.processImages ?? true,
              imageProxyBase: options.imageProxyBase || '',
              headers: options.headers || {},
              strategy: options.strategy || 'auto',
              referer: options.referer || ''
            }
          : undefined
      }

      const deadline = new Date()
      deadline.setSeconds(deadline.getSeconds() + 30)

      if (!this.client) {
        throw new Error('gRPC client not connected')
      }

      this.client.FetchArticle(
        request,
        { deadline },
        (err: grpc.ServiceError | null, response: FetchResponse) => {
          if (err) {
            reject(err)
          } else {
            resolve(this.transformResponse(response))
          }
        }
      )
    })
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<GrpcHealthResponse> {
    if (!this.connected) {
      throw new Error('gRPC client not connected')
    }

    return new Promise((resolve, reject) => {
      const deadline = new Date()
      deadline.setSeconds(deadline.getSeconds() + 5)

      if (!this.client) {
        throw new Error('gRPC client not connected')
      }

      this.client.HealthCheck({}, { deadline }, (err: grpc.ServiceError | null, response: HealthResponse) => {
        if (err) {
          reject(err)
        } else {
          resolve({
            status: response.status,
            maxConcurrent: response.maxConcurrent,
            available: response.available,
            cycletlsEnabled: response.cycletlsEnabled
          })
        }
      })
    })
  }

  /**
   * 检查服务是否可用（对齐 HTTP 客户端 API）
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!this.connected) {
        return false
      }
      const health = await this.healthCheck()
      return health.status === 'ok'
    } catch {
      return false
    }
  }

  /**
   * 原始抓取（不经过 Readability 处理）
   */
  async fetchRaw(
    url: string,
    options?: GrpcFetchOptions
  ): Promise<GrpcRawResponse> {
    if (!this.connected) {
      throw new Error('gRPC client not connected')
    }

    return new Promise((resolve, reject) => {
      const request = {
        url,
        options: options
          ? {
              timeoutMs: options.timeoutMs || 15000,
              extractFulltext: false,
              processImages: false,
              headers: options.headers || {},
              strategy: options.strategy || 'auto',
              referer: options.referer || ''
            }
          : undefined
      }

      const deadline = new Date()
      deadline.setSeconds(deadline.getSeconds() + 30)

      if (!this.client) {
        throw new Error('gRPC client not connected')
      }

      this.client.FetchRaw(
        request,
        { deadline },
        (err: grpc.ServiceError | null, response: FetchRawResponse) => {
          if (err) {
            reject(err)
          } else {
            resolve(this.transformRawResponse(response))
          }
        }
      )
    })
  }

  /**
   * 关闭客户端
   */
  close(): void {
    if (this.client) {
      this.client.close()
      this.client = null
      this.connected = false
    }
  }

  /**
   * 转换响应格式
   */
  private transformResponse(response: FetchResponse): GrpcFetchResponse {
    return {
      url: response.url || '',
      finalUrl: response.finalUrl || '',
      title: response.title || '',
      content: response.content || '',
      textContent: response.textContent || '',
      excerpt: response.excerpt || '',
      byline: response.byline || '',
      siteName: response.siteName || '',
      images: (response.images || []).map((img: ProtoImage) => ({
        originalUrl: img.originalUrl || '',
        proxyUrl: img.proxyUrl || '',
        alt: img.alt || '',
        isLazy: img.isLazy || false
      })),
      readingTime: response.readingTime || 0,
      strategy: response.strategy || '',
      durationMs: typeof response.durationMs === 'number' ? response.durationMs : parseInt(String(response.durationMs || '0'), 10),
      error: response.error || ''
    }
  }

  /**
   * 转换原始抓取响应格式
   */
  private transformRawResponse(response: FetchRawResponse): GrpcRawResponse {
    return {
      url: response.url || '',
      finalUrl: response.finalUrl || '',
      body: response.body || '',
      contentType: response.contentType || '',
      statusCode: response.statusCode || 0,
      strategy: response.strategy || '',
      durationMs: typeof response.durationMs === 'number' ? response.durationMs : parseInt(String(response.durationMs || '0'), 10),
      error: response.error || ''
    }
  }
}

// 单例实例
let grpcClientInstance: GoScraperGrpcClient | null = null

/**
 * 获取 gRPC 客户端单例
 */
export function getGoScraperGrpcClient(): GoScraperGrpcClient {
  if (!grpcClientInstance) {
    grpcClientInstance = new GoScraperGrpcClient()
  }
  return grpcClientInstance
}

/**
 * 通过 gRPC 抓取文章（便捷函数）
 */
export async function fetchWithGrpc(
  url: string,
  options?: GrpcFetchOptions
): Promise<GrpcFetchResponse> {
  const client = getGoScraperGrpcClient()
  return client.fetchArticle(url, options)
}

/**
 * 检查 gRPC 服务健康状态
 */
export async function checkGrpcHealth(): Promise<boolean> {
  try {
    const client = getGoScraperGrpcClient()
    if (!client.isConnected()) {
      return false
    }
    const health = await client.healthCheck()
    return health.status === 'ok'
  } catch {
    return false
  }
}
