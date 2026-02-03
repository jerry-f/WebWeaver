/**
 * 统一抓取服务
 *
 * 整合所有抓取策略，自动处理：
 * - 站点凭证注入（Cookie）
 * - 策略选择（gRPC / Browserless / 本地）
 * - 失败重试和回退
 * - 凭证过期检测
 */

import { GrpcClientAdapter, type IScraperClient } from './clients/scraper-adapter'
import { CredentialManager } from '../auth/credential-manager'
import { fetchFullText, type FullTextResult } from './fulltext'
import { fetchFullTextWithBrowserless, renderPage, checkBrowserlessHealth } from './clients/browserless'
import type { FetchStrategy } from './types'

/**
 * 抓取选项
 */
export interface UnifiedFetchOptions {
  /** 超时时间（毫秒） */
  timeout?: number
  /** Referer */
  referer?: string
  /** 强制使用指定策略 */
  strategy?: FetchStrategy
  /** 是否跳过凭证 */
  skipCredentials?: boolean
  /** 源 ID（用于关联数据库凭证） */
  sourceId?: string
}

/**
 * 统一抓取结果
 */
export interface UnifiedFetchResult {
  /** 是否成功 */
  success: boolean
  /** 最终 URL（可能重定向） */
  finalUrl?: string
  /** 文章标题 */
  title?: string
  /** HTML 内容 */
  content?: string
  /** 纯文本内容 */
  textContent?: string
  /** 摘要 */
  excerpt?: string
  /** 作者 */
  byline?: string
  /** 网站名称 */
  siteName?: string
  /** 图片列表 */
  images?: Array<{ originalUrl: string; alt?: string }>
  /** 使用的策略 */
  strategy: string
  /** 耗时（毫秒） */
  duration: number
  /** 是否使用了认证 */
  authenticated: boolean
  /** 凭证是否过期 */
  credentialExpired?: boolean
  /** 错误信息 */
  error?: string
}

/**
 * 原始抓取结果（不经过 Readability 处理）
 */
export interface RawFetchResult {
  /** 是否成功 */
  success: boolean
  /** 最终 URL（可能重定向） */
  finalUrl?: string
  /** 原始内容（HTML/XML） */
  body: string
  /** Content-Type */
  contentType?: string
  /** HTTP 状态码 */
  statusCode: number
  /** 使用的策略 */
  strategy: string
  /** 耗时（毫秒） */
  duration: number
  /** 是否使用了认证 */
  authenticated: boolean
  /** 错误信息 */
  error?: string
}

/**
 * 统一抓取服务类
 */
export class UnifiedFetcher {
  private scraperClient: IScraperClient
  private credentialManager: CredentialManager
  private scraperAvailable: boolean | null = null

  constructor() {
    this.scraperClient = new GrpcClientAdapter()
    this.credentialManager = new CredentialManager()
  }

  /**
   * 抓取文章
   */
  async fetch(url: string, options: UnifiedFetchOptions = {}): Promise<UnifiedFetchResult> {
    const start = Date.now()
    const strategy = options.strategy || 'auto'

    // 准备请求头（包含 Cookie）
    const headers: Record<string, string> = {}
    let authenticated = false

    if (!options.skipCredentials) {
      const cookie = this.credentialManager.getCookieForUrl(url)
      if (cookie) {
        headers['Cookie'] = cookie
        authenticated = true
      }
    }

    // 选择抓取策略
    let result: UnifiedFetchResult

    if (strategy === 'local') {
      result = await this.fetchLocal(url, options, authenticated)
    } else if (strategy === 'browserless') {
      // 使用 Browserless 浏览器渲染（用于 SPA 页面）
      result = await this.fetchWithBrowserless(url, options, authenticated)
    } else if (strategy === 'go' || (strategy === 'auto' && await this.isScraperAvailable())) {
      result = await this.fetchWithScraper(url, headers, options, authenticated)

      // 远程抓取失败时回退到本地
      if (!result.success && strategy === 'auto') {
        console.log(`[UnifiedFetcher] 远程抓取失败，回退到本地抓取: ${url}`)
        result = await this.fetchLocal(url, options, authenticated)
      }
    } else {
      result = await this.fetchLocal(url, options, authenticated)
    }

    result.duration = Date.now() - start
    result.authenticated = authenticated

    // 检测凭证过期
    if (authenticated && result.error?.includes('403')) {
      result.credentialExpired = true
      console.warn(`[UnifiedFetcher] 凭证可能已过期: ${this.extractDomain(url)}`)
    }

    return result
  }

  /**
   * 使用远程抓取服务抓取
   */
  private async fetchWithScraper(
    url: string,
    headers: Record<string, string>,
    options: UnifiedFetchOptions,
    authenticated: boolean
  ): Promise<UnifiedFetchResult> {
    try {
      const response = await this.scraperClient.fetch({
        url,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        referer: options.referer,
        timeout: options.timeout
      })

      if (!response || response.error) {
        return {
          success: false,
          strategy: 'grpc',
          duration: 0,
          authenticated,
          error: response?.error || '远程抓取服务返回空结果'
        }
      }

      return {
        success: true,
        finalUrl: response.finalUrl,
        title: response.title,
        content: response.content,
        textContent: response.textContent,
        excerpt: response.excerpt,
        byline: response.byline,
        siteName: response.siteName,
        images: response.images,
        strategy: 'grpc',
        duration: response.duration,
        authenticated
      }
    } catch (error) {
      return {
        success: false,
        strategy: 'grpc',
        duration: 0,
        authenticated,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 使用本地 Readability 抓取
   */
  private async fetchLocal(
    url: string,
    options: UnifiedFetchOptions,
    authenticated: boolean
  ): Promise<UnifiedFetchResult> {
    try {
      // 本地抓取暂不支持 Cookie 注入
      // TODO: 后续可以扩展 fetchFullText 支持自定义 headers
      const result = await fetchFullText(url)

      if (!result) {
        return {
          success: false,
          strategy: 'local',
          duration: 0,
          authenticated: false, // 本地抓取未使用认证
          error: '本地抓取失败'
        }
      }

      return {
        success: true,
        title: result.title,
        content: result.content,
        textContent: result.textContent,
        excerpt: result.excerpt,
        byline: result.byline,
        siteName: result.siteName,
        images: result.images?.map(img => ({
          originalUrl: img.originalUrl,
          alt: img.alt
        })),
        strategy: 'local',
        duration: 0,
        authenticated: false
      }
    } catch (error) {
      return {
        success: false,
        strategy: 'local',
        duration: 0,
        authenticated: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 使用 Browserless 浏览器渲染抓取
   * 用于处理需要 JavaScript 渲染的 SPA 页面
   */
  private async fetchWithBrowserless(
    url: string,
    options: UnifiedFetchOptions,
    authenticated: boolean
  ): Promise<UnifiedFetchResult> {
    try {
      const result = await fetchFullTextWithBrowserless(url, {
        timeout: options.timeout
      })

      if (!result) {
        return {
          success: false,
          strategy: 'browserless',
          duration: 0,
          authenticated,
          error: 'Browserless 渲染失败'
        }
      }

      return {
        success: true,
        title: result.title,
        content: result.content,
        textContent: result.textContent,
        excerpt: result.excerpt,
        byline: result.byline,
        siteName: result.siteName,
        images: result.images?.map(img => ({
          originalUrl: img.originalUrl,
          alt: img.alt
        })),
        strategy: 'browserless',
        duration: result.duration,
        authenticated
      }
    } catch (error) {
      console.error('[UnifiedFetcher] Browserless error:', error)
      return {
        success: false,
        strategy: 'browserless',
        duration: 0,
        authenticated,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 检查远程抓取服务是否可用
   */
  private async isScraperAvailable(): Promise<boolean> {
    // 缓存检查结果 60 秒
    if (this.scraperAvailable !== null) {
      return this.scraperAvailable
    }

    try {
      this.scraperAvailable = await this.scraperClient.isAvailable()

      // 60 秒后重新检查
      setTimeout(() => {
        this.scraperAvailable = null
      }, 60000)

      return this.scraperAvailable
    } catch {
      this.scraperAvailable = false
      return false
    }
  }

  /**
   * 原始抓取（不经过 Readability 处理）
   * 用于 RSS/Scrape 列表页抓取，只需要原始 HTML/XML
   */
  async fetchRaw(url: string, options: UnifiedFetchOptions = {}): Promise<RawFetchResult> {
    const start = Date.now()

    // 准备请求头（包含 Cookie）
    const headers: Record<string, string> = {}
    let authenticated = false

    if (!options.skipCredentials) {
      const cookie = this.credentialManager.getCookieForUrl(url)
      if (cookie) {
        headers['Cookie'] = cookie
        authenticated = true
      }
    }

    // 优先使用远程抓取服务
    if (await this.isScraperAvailable()) {
      try {
        const response = await this.scraperClient.fetchRaw({
          url,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          referer: options.referer,
          timeout: options.timeout
        })

        if (response && !response.error) {
          return {
            success: true,
            finalUrl: response.finalUrl,
            body: response.body,
            contentType: response.contentType,
            statusCode: response.statusCode,
            strategy: response.strategy,
            duration: Date.now() - start,
            authenticated
          }
        }

        // 远程抓取失败，回退到本地
        console.log(`[UnifiedFetcher] 远程 fetchRaw 失败，回退到本地: ${url}`)
      } catch (error) {
        console.error('[UnifiedFetcher] 远程 fetchRaw error:', error)
      }
    }

    // 本地 fetch 回退（不带 TLS 指纹伪造）
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'NewsFlow/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...headers
        },
        signal: AbortSignal.timeout(options.timeout || 30000)
      })

      const body = await response.text()

      return {
        success: response.ok,
        finalUrl: response.url,
        body,
        contentType: response.headers.get('content-type') || undefined,
        statusCode: response.status,
        strategy: 'local',
        duration: Date.now() - start,
        authenticated,
        error: response.ok ? undefined : `HTTP ${response.status}`
      }
    } catch (error) {
      return {
        success: false,
        body: '',
        statusCode: 0,
        strategy: 'local',
        duration: Date.now() - start,
        authenticated,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 批量抓取
   */
  async fetchBatch(
    urls: string[],
    options: UnifiedFetchOptions = {}
  ): Promise<UnifiedFetchResult[]> {
    const results: UnifiedFetchResult[] = []

    // 按域名分组，为每个域名准备 Cookie
    const urlsWithCookies = urls.map(url => ({
      url,
      cookie: options.skipCredentials ? null : this.credentialManager.getCookieForUrl(url)
    }))

    // 使用远程抓取服务批量抓取
    if (await this.isScraperAvailable()) {
      // TODO: 扩展 Go Scraper 批量接口支持 per-URL headers
      // 目前先逐个抓取
      for (const { url, cookie } of urlsWithCookies) {
        const result = await this.fetch(url, {
          ...options,
          skipCredentials: !cookie
        })
        results.push(result)
      }
    } else {
      // 本地并发抓取
      const promises = urlsWithCookies.map(({ url }) =>
        this.fetch(url, { ...options, strategy: 'local' })
      )
      results.push(...await Promise.all(promises))
    }

    return results
  }

  /**
   * 获取需要认证的域名列表
   */
  getAuthenticatedDomains(): string[] {
    return this.credentialManager.getAuthenticatedDomains()
  }

  /**
   * 检查 URL 是否需要认证
   */
  requiresAuth(url: string): boolean {
    return this.credentialManager.requiresAuth(url)
  }

  /**
   * 重新加载凭证配置
   */
  reloadCredentials(): void {
    this.credentialManager.reload()
  }

  /**
   * 提取域名
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  }
}

// 单例
let _instance: UnifiedFetcher | null = null

/**
 * 获取统一抓取服务单例
 */
export function getUnifiedFetcher(): UnifiedFetcher {
  if (!_instance) {
    _instance = new UnifiedFetcher()
  }
  return _instance
}

/**
 * 抓取文章（快捷方法）
 */
export async function fetchArticle(
  url: string,
  options?: UnifiedFetchOptions
): Promise<UnifiedFetchResult> {
  return getUnifiedFetcher().fetch(url, options)
}

/**
 * 批量抓取文章
 */
export async function fetchArticles(
  urls: string[],
  options?: UnifiedFetchOptions
): Promise<UnifiedFetchResult[]> {
  return getUnifiedFetcher().fetchBatch(urls, options)
}

/**
 * 原始抓取（快捷方法）
 * 用于 RSS/Scrape 列表页抓取，只需要原始 HTML/XML
 */
export async function fetchRaw(
  url: string,
  options?: UnifiedFetchOptions
): Promise<RawFetchResult> {
  return getUnifiedFetcher().fetchRaw(url, options)
}
