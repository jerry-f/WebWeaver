/**
 * 统一抓取管道
 *
 * 整合标准 HTTP 抓取和 Browserless 渲染，提供智能回退机制
 */

import { fetchFullText, type FullTextResult } from '../fulltext'
import {
  fetchFullTextWithBrowserless,
  checkBrowserlessHealth,
  type BrowserlessConfig
} from './browserless'
import {
  getRecommendedStrategy,
  needsScroll,
  shouldFallbackToBrowserless,
  type FetchStrategy
} from './strategy'

/**
 * 管道配置
 */
export interface PipelineConfig {
  /** 是否启用 Browserless 回退 */
  enableBrowserlessFallback?: boolean
  /** Browserless 配置 */
  browserless?: Partial<BrowserlessConfig>
  /** 强制使用的策略（跳过自动检测） */
  forceStrategy?: FetchStrategy
  /** 超时时间（毫秒） */
  timeout?: number
}

/**
 * 管道结果
 */
export interface PipelineResult extends FullTextResult {
  /** 使用的策略 */
  strategy: FetchStrategy
  /** 是否发生回退 */
  didFallback: boolean
  /** 总耗时（毫秒） */
  duration: number
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: PipelineConfig = {
  enableBrowserlessFallback: true,
  timeout: 30000
}

/**
 * Browserless 可用性缓存
 */
let browserlessAvailable: boolean | null = null
let lastHealthCheck = 0
const HEALTH_CHECK_INTERVAL = 60000 // 1 分钟

/**
 * 检查 Browserless 是否可用（带缓存）
 */
async function isBrowserlessAvailable(config?: Partial<BrowserlessConfig>): Promise<boolean> {
  const now = Date.now()

  // 使用缓存结果
  if (browserlessAvailable !== null && now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
    return browserlessAvailable
  }

  // 执行健康检查
  browserlessAvailable = await checkBrowserlessHealth(config)
  lastHealthCheck = now

  return browserlessAvailable
}

/**
 * 统一抓取入口
 *
 * 智能选择抓取策略：
 * 1. 根据域名规则选择初始策略
 * 2. 如果标准抓取失败或质量不足，自动回退到 Browserless
 * 3. 支持强制指定策略
 *
 * @param url - 目标 URL
 * @param config - 配置选项
 * @returns 抓取结果
 */
export async function fetchWithPipeline(
  url: string,
  config: PipelineConfig = {}
): Promise<PipelineResult | null> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const startTime = Date.now()

  // 确定初始策略
  let strategy: FetchStrategy = cfg.forceStrategy || getRecommendedStrategy(url)
  let didFallback = false

  // 如果初始策略是 browserless，先检查可用性
  if (strategy === 'browserless') {
    const available = await isBrowserlessAvailable(cfg.browserless)
    if (!available) {
      console.warn('Browserless not available, falling back to fetch:', url)
      strategy = 'fetch'
    }
  }

  // 策略 1: 标准 HTTP 抓取
  if (strategy === 'fetch') {
    const result = await fetchFullText(url)

    if (result) {
      // 检查是否需要回退
      const needsFallback = cfg.enableBrowserlessFallback &&
        shouldFallbackToBrowserless('', result.textContent, result.title)

      if (!needsFallback) {
        // 抓取成功，返回结果
        return {
          ...result,
          strategy: 'fetch',
          didFallback: false,
          duration: Date.now() - startTime
        }
      }

      // 需要回退，检查 Browserless 可用性
      if (await isBrowserlessAvailable(cfg.browserless)) {
        console.log('Content quality insufficient, falling back to Browserless:', url)
        strategy = 'browserless'
        didFallback = true
      } else {
        // Browserless 不可用，返回当前结果（虽然质量不高）
        return {
          ...result,
          strategy: 'fetch',
          didFallback: false,
          duration: Date.now() - startTime
        }
      }
    } else if (cfg.enableBrowserlessFallback) {
      // 抓取完全失败，尝试回退
      if (await isBrowserlessAvailable(cfg.browserless)) {
        console.log('Fetch failed, falling back to Browserless:', url)
        strategy = 'browserless'
        didFallback = true
      } else {
        return null
      }
    } else {
      return null
    }
  }

  // 策略 2: Browserless 渲染
  if (strategy === 'browserless') {
    const scrollEnabled = needsScroll(url)
    const browserlessResult = await fetchFullTextWithBrowserless(url, {
      ...cfg.browserless,
      scroll: scrollEnabled ? { enabled: true } : undefined
    })

    if (browserlessResult) {
      return {
        content: browserlessResult.content,
        textContent: browserlessResult.textContent,
        title: browserlessResult.title,
        excerpt: browserlessResult.excerpt,
        byline: browserlessResult.byline,
        siteName: browserlessResult.siteName,
        images: browserlessResult.images,
        strategy: 'browserless',
        didFallback,
        duration: Date.now() - startTime
      }
    }
  }

  return null
}

/**
 * 批量抓取（带并发控制）
 *
 * @param urls - URL 列表
 * @param config - 配置选项
 * @param concurrency - 并发数
 * @returns 抓取结果列表
 */
export async function fetchBatch(
  urls: string[],
  config: PipelineConfig = {},
  concurrency = 3
): Promise<(PipelineResult | null)[]> {
  const results: (PipelineResult | null)[] = new Array(urls.length).fill(null)
  const queue = urls.map((url, index) => ({ url, index }))

  // 工作函数
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break

      try {
        results[item.index] = await fetchWithPipeline(item.url, config)
      } catch (error) {
        console.error('Batch fetch error:', item.url, error)
        results[item.index] = null
      }
    }
  }

  // 启动 worker
  const workers = Array(Math.min(concurrency, urls.length))
    .fill(null)
    .map(() => worker())

  await Promise.all(workers)

  return results
}

/**
 * 重置 Browserless 可用性缓存
 *
 * 在服务重启或配置变更后调用
 */
export function resetBrowserlessCache(): void {
  browserlessAvailable = null
  lastHealthCheck = 0
}
