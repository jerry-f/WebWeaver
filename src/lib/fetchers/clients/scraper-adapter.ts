/**
 * 抓取客户端适配器
 *
 * 统一 HTTP 和 gRPC 客户端的接口差异
 * 使 UnifiedFetcher 可以无缝切换底层实现
 */

import {
  GoScraperGrpcClient,
  type GrpcFetchResponse,
  type GrpcRawResponse,
  type GrpcFetchOptions
} from './grpc-client'
import {
  GoScraperClient,
  type GoScraperRequest,
  type GoScraperResponse,
  type GoRawResponse
} from './go-scraper'

/**
 * 统一的抓取请求
 */
export interface ScraperRequest {
  url: string
  headers?: Record<string, string>
  referer?: string
  timeout?: number
}

/**
 * 统一的抓取响应（文章）
 */
export interface ScraperArticleResponse {
  url: string
  finalUrl: string
  title?: string
  content?: string
  textContent?: string
  excerpt?: string
  byline?: string
  siteName?: string
  images?: Array<{ originalUrl: string; alt?: string }>
  readingTime?: number
  strategy: string
  duration: number // 统一使用 duration（毫秒）
  error?: string
}

/**
 * 统一的原始抓取响应
 */
export interface ScraperRawResponse {
  url: string
  finalUrl: string
  body: string
  contentType?: string
  statusCode: number
  strategy: string
  duration: number // 统一使用 duration（毫秒）
  error?: string
}

/**
 * 抓取客户端接口
 */
export interface IScraperClient {
  isAvailable(): Promise<boolean>
  fetch(request: ScraperRequest): Promise<ScraperArticleResponse | null>
  fetchRaw(request: ScraperRequest): Promise<ScraperRawResponse | null>
}

/**
 * gRPC 客户端适配器
 */
export class GrpcClientAdapter implements IScraperClient {
  private client: GoScraperGrpcClient

  constructor(client?: GoScraperGrpcClient) {
    this.client = client || new GoScraperGrpcClient()
  }

  async isAvailable(): Promise<boolean> {
    return this.client.isAvailable()
  }

  async fetch(request: ScraperRequest): Promise<ScraperArticleResponse | null> {
    try {
      const options: GrpcFetchOptions = {
        timeoutMs: request.timeout,
        headers: request.headers,
        referer: request.referer,
        extractFulltext: true,
        processImages: true
      }

      const response = await this.client.fetchArticle(request.url, options)
      return this.transformArticleResponse(response)
    } catch (error) {
      console.error('[GrpcClientAdapter] fetch error:', error)
      return null
    }
  }

  async fetchRaw(request: ScraperRequest): Promise<ScraperRawResponse | null> {
    try {
      const options: GrpcFetchOptions = {
        timeoutMs: request.timeout,
        headers: request.headers,
        referer: request.referer,
        extractFulltext: false
      }

      const response = await this.client.fetchRaw(request.url, options)
      return this.transformRawResponse(response)
    } catch (error) {
      console.error('[GrpcClientAdapter] fetchRaw error:', error)
      return null
    }
  }

  /**
   * 转换文章响应：durationMs -> duration
   */
  private transformArticleResponse(response: GrpcFetchResponse): ScraperArticleResponse {
    return {
      url: response.url,
      finalUrl: response.finalUrl,
      title: response.title || undefined,
      content: response.content || undefined,
      textContent: response.textContent || undefined,
      excerpt: response.excerpt || undefined,
      byline: response.byline || undefined,
      siteName: response.siteName || undefined,
      images: response.images?.map(img => ({
        originalUrl: img.originalUrl,
        alt: img.alt || undefined
      })),
      readingTime: response.readingTime || undefined,
      strategy: response.strategy || 'grpc',
      duration: response.durationMs, // 关键：durationMs -> duration
      error: response.error || undefined
    }
  }

  /**
   * 转换原始响应：durationMs -> duration
   */
  private transformRawResponse(response: GrpcRawResponse): ScraperRawResponse {
    return {
      url: response.url,
      finalUrl: response.finalUrl,
      body: response.body,
      contentType: response.contentType || undefined,
      statusCode: response.statusCode,
      strategy: response.strategy || 'grpc',
      duration: response.durationMs, // 关键：durationMs -> duration
      error: response.error || undefined
    }
  }
}

/**
 * HTTP 客户端适配器（保留作为参考）
 */
export class HttpClientAdapter implements IScraperClient {
  private client: GoScraperClient

  constructor(client?: GoScraperClient) {
    this.client = client || new GoScraperClient()
  }

  async isAvailable(): Promise<boolean> {
    return this.client.isAvailable()
  }

  async fetch(request: ScraperRequest): Promise<ScraperArticleResponse | null> {
    const goRequest: GoScraperRequest = {
      url: request.url,
      headers: request.headers,
      referer: request.referer,
      timeout: request.timeout
    }

    const response = await this.client.fetch(goRequest)
    if (!response) return null

    return {
      url: response.url,
      finalUrl: response.finalUrl,
      title: response.title,
      content: response.content,
      textContent: response.textContent,
      excerpt: response.excerpt,
      byline: response.byline,
      siteName: response.siteName,
      images: response.images?.map(img => ({
        originalUrl: img.originalUrl,
        alt: img.alt
      })),
      readingTime: response.readingTime,
      strategy: response.strategy,
      duration: response.duration,
      error: response.error
    }
  }

  async fetchRaw(request: ScraperRequest): Promise<ScraperRawResponse | null> {
    const goRequest: GoScraperRequest = {
      url: request.url,
      headers: request.headers,
      referer: request.referer,
      timeout: request.timeout
    }

    const response = await this.client.fetchRaw(goRequest)
    if (!response) return null

    return {
      url: response.url,
      finalUrl: response.finalUrl,
      body: response.body,
      contentType: response.contentType,
      statusCode: response.statusCode,
      strategy: response.strategy,
      duration: response.duration,
      error: response.error
    }
  }
}

/**
 * 获取默认的抓取客户端（使用 gRPC）
 */
export function getScraperClient(): IScraperClient {
  return new GrpcClientAdapter()
}
