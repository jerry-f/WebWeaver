/**
 * Go 抓取服务 gRPC 客户端
 *
 * 通过 gRPC 协议与 Go 抓取服务通信
 * 比 REST 快 7-10 倍
 */

import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import path from 'path'

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

// Proto 文件路径
const PROTO_PATH = path.join(
  process.cwd(),
  'go-scraper-service/api/proto/scraper.proto'
)

/**
 * Go 抓取服务 gRPC 客户端
 */
export class GoScraperGrpcClient {
  private client: any
  private connected: boolean = false

  constructor(config: GrpcClientConfig = {}) {
    const address = config.address || process.env.GO_SCRAPER_GRPC_URL || 'localhost:50051'

    try {
      // 加载 proto 文件
      const packageDef = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      })

      const proto = grpc.loadPackageDefinition(packageDef) as any

      // 创建客户端
      this.client = new proto.scraper.ScraperService(
        address,
        grpc.credentials.createInsecure(),
        {
          'grpc.max_receive_message_length': 50 * 1024 * 1024, // 50MB
          'grpc.max_send_message_length': 10 * 1024 * 1024 // 10MB
        }
      )

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
              timeout_ms: options.timeoutMs || 15000,
              extract_fulltext: options.extractFulltext ?? true,
              process_images: options.processImages ?? true,
              image_proxy_base: options.imageProxyBase || '',
              headers: options.headers || {},
              strategy: options.strategy || 'auto',
              referer: options.referer || ''
            }
          : undefined
      }

      const deadline = new Date()
      deadline.setSeconds(deadline.getSeconds() + 30)

      this.client.FetchArticle(
        request,
        { deadline },
        (err: Error | null, response: any) => {
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

      this.client.HealthCheck({}, { deadline }, (err: Error | null, response: any) => {
        if (err) {
          reject(err)
        } else {
          resolve({
            status: response.status,
            maxConcurrent: response.max_concurrent,
            available: response.available,
            cycletlsEnabled: response.cycletls_enabled
          })
        }
      })
    })
  }

  /**
   * 关闭客户端
   */
  close(): void {
    if (this.client) {
      grpc.closeClient(this.client)
      this.connected = false
    }
  }

  /**
   * 转换响应格式
   */
  private transformResponse(response: any): GrpcFetchResponse {
    return {
      url: response.url || '',
      finalUrl: response.final_url || '',
      title: response.title || '',
      content: response.content || '',
      textContent: response.text_content || '',
      excerpt: response.excerpt || '',
      byline: response.byline || '',
      siteName: response.site_name || '',
      images: (response.images || []).map((img: any) => ({
        originalUrl: img.original_url || '',
        proxyUrl: img.proxy_url || '',
        alt: img.alt || '',
        isLazy: img.is_lazy || false
      })),
      readingTime: response.reading_time || 0,
      strategy: response.strategy || '',
      durationMs: parseInt(response.duration_ms || '0', 10),
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
