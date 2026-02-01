/**
 * 域名级调度器
 *
 * 实现防封核心功能：
 * - 每域名并发控制
 * - RPS 限速
 * - 失败指数退避
 * - 连续失败熔断
 */

/**
 * 域名状态
 */
interface DomainState {
  /** 同时最大并发 */
  maxConcurrent: number
  /** 每秒请求数 */
  rps: number
  /** 当前退避时间 (ms) */
  backoff: number
  /** 连续失败次数 */
  failCount: number
  /** 熔断状态 */
  circuitOpen: boolean
  /** 熔断恢复时间 */
  circuitOpenUntil: number
  /** 上次请求时间戳 */
  lastRequest: number
  /** 当前活跃请求数 */
  activeRequests: number
}

/**
 * 域名限制配置
 */
interface DomainLimitConfig {
  maxConcurrent: number
  rps: number
}

/**
 * 默认限制配置
 */
const DEFAULT_LIMITS: Record<string, DomainLimitConfig> = {
  // 严格限制的站点
  'medium.com': { maxConcurrent: 2, rps: 1 },
  'twitter.com': { maxConcurrent: 1, rps: 0.5 },
  'x.com': { maxConcurrent: 1, rps: 0.5 },

  // 中等限制
  'zhihu.com': { maxConcurrent: 3, rps: 2 },
  'juejin.cn': { maxConcurrent: 3, rps: 2 },
  'segmentfault.com': { maxConcurrent: 3, rps: 2 },

  // 宽松限制
  'weixin.qq.com': { maxConcurrent: 5, rps: 5 },
  'mp.weixin.qq.com': { maxConcurrent: 5, rps: 5 },
  'github.com': { maxConcurrent: 5, rps: 3 },

  // 默认配置
  '*': { maxConcurrent: 10, rps: 10 }
}

/**
 * 熔断配置
 */
const CIRCUIT_BREAKER = {
  /** 触发熔断的连续失败次数 */
  failThreshold: 5,
  /** 熔断持续时间 (ms) */
  openDuration: 5 * 60 * 1000, // 5 分钟
  /** 最大退避时间 (ms) */
  maxBackoff: 60 * 1000, // 60 秒
  /** 初始退避时间 (ms) */
  initialBackoff: 1000 // 1 秒
}

/**
 * 域名调度器
 */
export class DomainScheduler {
  private domains: Map<string, DomainState> = new Map()
  private waitingQueue: Map<string, Array<() => void>> = new Map()

  /**
   * 获取域名的限制配置
   */
  private getLimitConfig(domain: string): DomainLimitConfig {
    return DEFAULT_LIMITS[domain] || DEFAULT_LIMITS['*']
  }

  /**
   * 获取或创建域名状态
   */
  private getState(domain: string): DomainState {
    let state = this.domains.get(domain)

    if (!state) {
      const config = this.getLimitConfig(domain)
      state = {
        maxConcurrent: config.maxConcurrent,
        rps: config.rps,
        backoff: 0,
        failCount: 0,
        circuitOpen: false,
        circuitOpenUntil: 0,
        lastRequest: 0,
        activeRequests: 0
      }
      this.domains.set(domain, state)
    }

    return state
  }

  /**
   * 计算需要等待的时间
   */
  private calculateWaitTime(state: DomainState): number {
    const now = Date.now()

    // 检查熔断状态
    if (state.circuitOpen) {
      if (now < state.circuitOpenUntil) {
        return state.circuitOpenUntil - now
      }
      // 熔断恢复，重置状态
      state.circuitOpen = false
      state.failCount = 0
      state.backoff = 0
    }

    // 检查并发限制
    if (state.activeRequests >= state.maxConcurrent) {
      return 100 // 等待 100ms 后重试
    }

    // 检查 RPS 限制
    const minInterval = 1000 / state.rps
    const timeSinceLastRequest = now - state.lastRequest
    if (timeSinceLastRequest < minInterval) {
      return minInterval - timeSinceLastRequest
    }

    // 检查退避
    if (state.backoff > 0) {
      return state.backoff
    }

    return 0
  }

  /**
   * 请求许可
   *
   * @param domain - 域名
   * @returns 需要等待的毫秒数，0 表示可立即执行
   */
  async acquire(domain: string): Promise<number> {
    const state = this.getState(domain)
    const waitTime = this.calculateWaitTime(state)

    if (waitTime > 0) {
      return waitTime
    }

    // 获取许可
    state.activeRequests++
    state.lastRequest = Date.now()

    return 0
  }

  /**
   * 等待并获取许可
   *
   * @param domain - 域名
   */
  async acquireWithWait(domain: string): Promise<void> {
    const waitTime = await this.acquire(domain)

    if (waitTime > 0) {
      await this.sleep(waitTime)
      return this.acquireWithWait(domain)
    }
  }

  /**
   * 释放许可
   *
   * @param domain - 域名
   */
  release(domain: string): void {
    const state = this.domains.get(domain)
    if (state && state.activeRequests > 0) {
      state.activeRequests--

      // 唤醒等待队列中的下一个请求
      const queue = this.waitingQueue.get(domain)
      if (queue && queue.length > 0) {
        const next = queue.shift()
        if (next) next()
      }
    }
  }

  /**
   * 报告成功
   *
   * @param domain - 域名
   */
  reportSuccess(domain: string): void {
    const state = this.domains.get(domain)
    if (state) {
      state.failCount = 0
      state.backoff = 0
    }
  }

  /**
   * 报告失败（触发退避/熔断）
   *
   * @param domain - 域名
   */
  reportFailure(domain: string): void {
    const state = this.getState(domain)
    state.failCount++

    // 计算指数退避：2^n 秒
    state.backoff = Math.min(
      CIRCUIT_BREAKER.initialBackoff * Math.pow(2, state.failCount - 1),
      CIRCUIT_BREAKER.maxBackoff
    )

    // 检查是否触发熔断
    if (state.failCount >= CIRCUIT_BREAKER.failThreshold) {
      state.circuitOpen = true
      state.circuitOpenUntil = Date.now() + CIRCUIT_BREAKER.openDuration
      console.warn(
        `[DomainScheduler] 熔断触发: ${domain}, 恢复时间: ${new Date(state.circuitOpenUntil).toISOString()}`
      )
    }
  }

  /**
   * 检查熔断状态
   *
   * @param domain - 域名
   * @returns 是否处于熔断状态
   */
  isCircuitOpen(domain: string): boolean {
    const state = this.domains.get(domain)
    if (!state) return false

    if (state.circuitOpen && Date.now() >= state.circuitOpenUntil) {
      // 熔断恢复
      state.circuitOpen = false
      state.failCount = 0
      state.backoff = 0
      return false
    }

    return state.circuitOpen
  }

  /**
   * 获取域名统计信息
   *
   * @param domain - 域名
   * @returns 统计信息
   */
  getStats(domain: string): {
    activeRequests: number
    failCount: number
    backoff: number
    circuitOpen: boolean
    circuitOpenUntil: number | null
  } | null {
    const state = this.domains.get(domain)
    if (!state) return null

    return {
      activeRequests: state.activeRequests,
      failCount: state.failCount,
      backoff: state.backoff,
      circuitOpen: state.circuitOpen,
      circuitOpenUntil: state.circuitOpen ? state.circuitOpenUntil : null
    }
  }

  /**
   * 获取所有域名统计
   */
  getAllStats(): Record<string, ReturnType<typeof this.getStats>> {
    const result: Record<string, ReturnType<typeof this.getStats>> = {}
    for (const [domain] of this.domains) {
      result[domain] = this.getStats(domain)
    }
    return result
  }

  /**
   * 重置域名状态
   *
   * @param domain - 域名
   */
  reset(domain: string): void {
    this.domains.delete(domain)
  }

  /**
   * 重置所有状态
   */
  resetAll(): void {
    this.domains.clear()
    this.waitingQueue.clear()
  }

  /**
   * 添加自定义域名限制
   *
   * @param domain - 域名
   * @param config - 限制配置
   */
  setDomainLimit(domain: string, config: Partial<DomainLimitConfig>): void {
    const currentConfig = this.getLimitConfig(domain)
    DEFAULT_LIMITS[domain] = { ...currentConfig, ...config }

    // 更新现有状态
    const state = this.domains.get(domain)
    if (state) {
      if (config.maxConcurrent !== undefined) {
        state.maxConcurrent = config.maxConcurrent
      }
      if (config.rps !== undefined) {
        state.rps = config.rps
      }
    }
  }

  /**
   * 辅助：延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * 全局调度器实例
 */
export const domainScheduler = new DomainScheduler()

/**
 * 从 URL 提取域名
 */
export function extractDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
