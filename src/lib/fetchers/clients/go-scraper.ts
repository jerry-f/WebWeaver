/**
 * Go 抓取服务客户端
 *
 * 通过 HTTP 调用 Go 抓取服务进行高性能文章抓取
 */

import type { ExtractedImage } from '../processors/image-processor'

/**
 * Go 抓取服务配置
 */
export interface GoScraperConfig {
  /** 服务地址 */
  endpoint: string
  /** 超时时间（毫秒） */
  timeout?: number
}

/**
 * 抓取请求
 */
export interface GoScraperRequest {
  url: string
  referer?: string
  headers?: Record<string, string>
  timeout?: number
}

/**
 * 抓取响应
 */
export interface GoScraperResponse {
  url: string
  finalUrl: string
  title?: string
  content?: string
  textContent?: string
  excerpt?: string
  byline?: string
  siteName?: string
  images?: ExtractedImage[]
  readingTime?: number
  strategy: 'go'
  duration: number
  error?: string
}

/**
 * 原始抓取响应（不经过 Readability 处理）
 */
export interface GoRawResponse {
  url: string
  finalUrl: string
  body: string           // 原始 HTML/XML 内容
  contentType?: string   // Content-Type
  statusCode: number     // HTTP 状态码
  strategy: string
  duration: number
  error?: string
}

/**
 * 批量抓取响应
 */
export interface GoBatchResponse {
  results: GoScraperResponse[]
  duration: number
}

/**
 * 健康检查响应
 */
export interface GoHealthResponse {
  status: string
  concurrency: number
  available: number
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: GoScraperConfig = {
  endpoint: process.env.GO_SCRAPER_URL || 'http://localhost:8088',
  timeout: 30000
}

/**
 * Go 抓取服务客户端
 */
export class GoScraperClient {
  private config: GoScraperConfig

  constructor(config: Partial<GoScraperConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 抓取单个 URL
   */
  async fetch(request: GoScraperRequest): Promise<GoScraperResponse | null> {
    try {
      const response = await fetch(`${this.config.endpoint}/fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: request.url,
          referer: request.referer,
          headers: request.headers,
          timeout: request.timeout || this.config.timeout
        }),
        signal: AbortSignal.timeout(request.timeout || this.config.timeout || 30000)
      })

      if (!response.ok) {
        console.error('Go scraper fetch failed:', response.status, response.statusText)
        return null
      }

      const data = await response.json() as GoScraperResponse

      // 转换图片格式
      if (data.images) {
        data.images = data.images.map(img => ({
          originalUrl: img.originalUrl,
          alt: img.alt,
          isLazy: img.isLazy
        }))
      }

      return data
    } catch (error) {
      console.error('Go scraper fetch error:', error)
      return null
    }
  }

  /**
   * 原始抓取（不经过 Readability 处理）
   * 用于 RSS/Scrape 列表页抓取，只需要原始 HTML/XML
   */
  async fetchRaw(request: GoScraperRequest): Promise<GoRawResponse | null> {
    try {
      const response = await fetch(`${this.config.endpoint}/fetch-raw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: request.url,
          referer: request.referer,
          headers: request.headers,
          timeout: request.timeout || this.config.timeout
        }),
        signal: AbortSignal.timeout(request.timeout || this.config.timeout || 30000)
      })

      if (!response.ok) {
        console.error('Go scraper fetchRaw failed:', response.status, response.statusText)
        return null
      }

      return await response.json() as GoRawResponse
    } catch (error) {
      console.error('Go scraper fetchRaw error:', error)
      return null
    }
  }

  /**
   * 批量抓取
   */
  async fetchBatch(
    urls: string[],
    options: { concurrency?: number; timeout?: number } = {}
  ): Promise<GoScraperResponse[]> {
    try {
      const response = await fetch(`${this.config.endpoint}/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          urls,
          concurrency: options.concurrency || 5,
          timeout: options.timeout || 60000
        }),
        signal: AbortSignal.timeout(options.timeout || 60000)
      })

      if (!response.ok) {
        console.error('Go scraper batch failed:', response.status)
        return []
      }

      const data = await response.json() as GoBatchResponse
      return data.results
    } catch (error) {
      console.error('Go scraper batch error:', error)
      return []
    }
  }

  /**
   * 健康检查
   */
  async health(): Promise<GoHealthResponse | null> {
    try {
      const response = await fetch(`${this.config.endpoint}/health`, {
        signal: AbortSignal.timeout(5000)
      })

      if (!response.ok) {
        return null
      }

      return await response.json() as GoHealthResponse
    } catch {
      return null
    }
  }

  /**
   * 检查服务是否可用
   */
  async isAvailable(): Promise<boolean> {
    const health = await this.health()
    return health?.status === 'ok'
  }
}

/**
 * 默认客户端实例
 */
let defaultClient: GoScraperClient | null = null

/**
 * 获取默认客户端
 */
export function getGoScraperClient(): GoScraperClient {
  if (!defaultClient) {
    defaultClient = new GoScraperClient()
  }
  return defaultClient
}

/**
 * 使用 Go 服务抓取文章
 *
 * 便捷函数，直接调用默认客户端
 */
export async function fetchWithGoScraper(
  url: string,
  options?: Partial<GoScraperRequest>
): Promise<GoScraperResponse | null> {
  const client = getGoScraperClient()
  return client.fetch({ url, ...options })
}

/**
 * 检查 Go 服务是否可用
 */
export async function checkGoScraperHealth(): Promise<boolean> {
  const client = getGoScraperClient()
  return client.isAvailable()
}
