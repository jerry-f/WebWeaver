/**
 * 域名级调度器
 *
 * 实现防封核心功能：
 * - 每域名并发控制
 * - RPS 限速
 * - 失败指数退避
 * - 连续失败熔断
 *
 * 典型用法：
 * - 在发起抓取/请求前：await acquireWithWait(domain)
 * - 请求完成后（无论成功失败都要）：release(domain)
 * - 成功：reportSuccess(domain)
 * - 失败：reportFailure(domain)
 */

/**
 * 域名状态
 *
 * 关于 maxConcurrent 与 rps（两个维度的限流）：
 * - maxConcurrent：并发上限（同一时刻最多允许多少个“在飞请求”）。它限制的是资源占用峰值，
 *   不等价于“每秒请求数”；实际每秒能发多少取决于单个请求耗时。
 * - rps：频率上限（平均每秒允许启动多少个请求）。本实现按最小间隔计算：minInterval = 1000 / rps。
 *   例如 rps=0.5 => minInterval=2000ms => 平均每 2 秒才允许启动 1 次请求（即 0.5 次/秒）。
 *
 * 为什么要两个一起用：
 * - 仅限并发：若请求很快，单位时间内仍可能打出很高的 RPS，容易触发站点风控。
 * - 仅限 RPS：若请求很慢，会积压很多并发占用连接/内存，影响自身稳定性。
 *
 * 本调度器的规则：同一次请求会同时受并发/RPS/退避等约束影响，等待时间取它们的最大值（最严格者生效）。
 */
interface DomainState {
  /** 同时最大并发（同一时刻允许的最大活跃请求数） */
  maxConcurrent: number
  /** 每秒请求数（Requests Per Second，允许为小数，例如 0.5 表示每 2 秒 1 次） */
  rps: number
  /** 退避截止时间戳 (ms)：now < backoffUntil 表示仍处于退避期 */
  backoffUntil: number
  /** 连续失败次数 */
  failCount: number
  /** 熔断状态（true 表示暂时禁止该域名继续请求） */
  circuitOpen: boolean
  /** 熔断恢复时间 */
  circuitOpenUntil: number
  /** 上次成功“获取许可”的时间戳（用于计算 RPS 间隔） */
  lastRequest: number
  /** 当前活跃请求数（已 acquire、未 release 的数量） */
  activeRequests: number
}

/**
 * 域名限制配置
 */
interface DomainLimitConfig {
  /** 最大并发 */
  maxConcurrent: number
  /** 每秒请求数 */
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
  // 注意：这里的 '*' 表示兜底配置（未命中具体域名时使用）
  '*': { maxConcurrent: 10, rps: 10 }
}

/**
 * 熔断配置
 */
let CIRCUIT_BREAKER = {
  /** 触发熔断的连续失败次数 */
  failThreshold: 5,
  /** 熔断持续时间 (ms) */
  openDuration: 5 * 60 * 1000, // 5 分钟
  /** 最大退避时间 (ms) */
  maxBackoff: 60 * 1000, // 60 秒
  /** 初始退避时间 (ms) */
  initialBackoff: 1000, // 1 秒
  /** acquireWithWait 最大等待时间 (ms)：避免永远排队导致任务“卡死” */
  maxWaitTimeout: 2 * 60 * 1000 // 2 分钟
}

/**
 * 等待信息：用于判断当前主要被哪种约束阻塞。
 */
type WaitPrimaryReason = 'none' | 'circuit' | 'concurrent' | 'rps' | 'backoff' | 'mixed'
// none - 无等待；
// circuit - 熔断；
// concurrent - 并发上限；
// rps - RPS 限速；
// backoff - 退避等待
// mixed - 多重原因

interface WaitInfo {
  waitTime: number // 总等待时间
  circuitWait: number // 熔断等待时间
  concurrentWait: number // 并发等待时间
  rpsWait: number // RPS 等待时间
  backoffWait: number // 退避等待时间
  primaryReason: WaitPrimaryReason // 主要等待原因（用于优化等待策略）
}

/**
 * 域名调度器
 */
export class DomainScheduler {
  private domains: Map<string, DomainState> = new Map()
  /**
   * 等待队列：用于“并发达到上限”时排队等待。
   *
   * 说明：
   * - RPS/退避/熔断属于时间约束，主要通过 sleep + 重试实现等待。
   * - 并发上限属于资源约束，使用队列可在 release 时更及时、更公平地唤醒下一位。
   */
  private waitingQueue: Map<string, Array<() => void>> = new Map()


  /**
   * 获取域名的限制配置
   */
  private getLimitConfig(domain: string): DomainLimitConfig {
    // 若没有该域名的专属配置，则使用 '*' 兜底配置
    return DEFAULT_LIMITS[domain] || DEFAULT_LIMITS['*']
  }

  /**
   * 获取或创建域名状态
   */
  private getState(domain: string): DomainState {
    let state = this.domains.get(domain)

    if (!state) {
      const config = this.getLimitConfig(domain)
      // 运行时状态会在 setDomainLimit 时动态更新
      state = {
        maxConcurrent: config.maxConcurrent, // 最大并发
        rps: config.rps, // 每秒请求数
        // backoff/failCount/circuit* 用于失败控制与熔断
        backoffUntil: 0, // 退避截止时间戳
        failCount: 0, // 连续失败计数
        circuitOpen: false, // 熔断状态
        circuitOpenUntil: 0, // 熔断恢复时间
        // lastRequest 用于 RPS 限速（以“获取许可”的时刻为准）
        lastRequest: 0, // 上次请求时间戳
        // activeRequests 用于并发控制（acquire++ / release--）
        activeRequests: 0 // 当前活跃请求数
      }
      this.domains.set(domain, state)
    }

    return state
  }

  /**
   * 计算需要等待的时间
   */
  private calculateWaitInfo(state: DomainState): WaitInfo {
    const now = Date.now()

    let circuitWait = 0

    // 1) 熔断：熔断期间直接返回剩余等待时间
    if (state.circuitOpen) {
      if (now < state.circuitOpenUntil) {
        circuitWait = state.circuitOpenUntil - now
        return {
          waitTime: circuitWait,
          circuitWait,
          concurrentWait: 0,
          rpsWait: 0,
          backoffWait: 0,
          primaryReason: 'circuit'
        }
      }
      // 熔断恢复：清空失败计数与退避，允许重新尝试
      state.circuitOpen = false
      state.failCount = 0
      state.backoffUntil = 0
    }

    // 注意：并发 / RPS / 退避 三者应同时约束同一次请求。
    // 等待时间应取它们的最大值，而不是命中一个就直接 return，避免“先等 RPS 再等退避”叠加。

    // 2) 并发：达到上限时短暂等待后重试（固定 100ms）
    const concurrentWait = state.activeRequests >= state.maxConcurrent ? 100 : 0

    // 3) RPS：用“最小间隔”控制请求节奏
    // - rps 可以是小数（如 0.5 => minInterval=2000ms）
    // - rps 应当 > 0；setDomainLimit 会拦截非正值。这里仍做防御性处理，避免异常配置导致忙等。
    let rpsWait = 0
    if (state.rps <= 0) {
      // 防御性兜底：视为“永远无法满足”，最终由 acquireWithWait 的总超时兜底
      rpsWait = Number.POSITIVE_INFINITY
    } else {
      const minInterval = 1000 / state.rps
      const timeSinceLastRequest = now - state.lastRequest
      if (timeSinceLastRequest < minInterval) {
        rpsWait = minInterval - timeSinceLastRequest
      }
    }

    // 4) 退避：在失败后按指数回退到某个时间点（reportFailure 设置 backoffUntil）
    const backoffWait = state.backoffUntil > now ? state.backoffUntil - now : 0

    const waitTime = Math.max(concurrentWait, rpsWait, backoffWait)
    const reasons: WaitPrimaryReason[] = []
    if (waitTime > 0) {
      if (waitTime === concurrentWait && concurrentWait > 0) reasons.push('concurrent')
      if (waitTime === rpsWait && rpsWait > 0) reasons.push('rps')
      if (waitTime === backoffWait && backoffWait > 0) reasons.push('backoff')
    }

    const primaryReason =
      waitTime <= 0
        ? 'none'
        : reasons.length === 1
          ? reasons[0]
          : 'mixed'

    return {
      waitTime,
      circuitWait,
      concurrentWait,
      rpsWait,
      backoffWait,
      primaryReason
    }
  }

  /**
   * 尝试获取许可（不等待）。
   * @returns acquired=true 表示已占用并发名额；否则返回建议等待信息。
   */
  private attemptAcquire(domain: string): { acquired: boolean; waitInfo: WaitInfo } {
    const state = this.getState(domain)
    const waitInfo = this.calculateWaitInfo(state)
    if (waitInfo.waitTime > 0) {
      return { acquired: false, waitInfo }
    }

    // 获取许可：更新并发计数，并记录本次“出发时间”用于 RPS
    state.activeRequests++
    state.lastRequest = Date.now()
    return { acquired: true, waitInfo }
  }

  /**
   * 并发受限时入队等待。
   * 返回 { promise, cancel }，用于在超时/定时器先触发时将等待者从队列移除，避免泄漏。
   */
  private enqueueWaiter(domain: string): { promise: Promise<void>; cancel: () => void } {
    let resolveFn: (() => void) | null = null
    const promise = new Promise<void>(resolve => {
      resolveFn = resolve
    })

    // 这里 resolveFn 一定已被赋值
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const waiter = resolveFn!

    const queue = this.waitingQueue.get(domain) ?? []
    queue.push(waiter)
    this.waitingQueue.set(domain, queue)

    const cancel = (): void => {
      const current = this.waitingQueue.get(domain)
      if (!current || current.length === 0) return
      const idx = current.indexOf(waiter)
      if (idx >= 0) current.splice(idx, 1)
      if (current.length === 0) this.waitingQueue.delete(domain)
    }

    return { promise, cancel }
  }

  /**
   * 请求许可
   *
   * @param domain - 域名
   * @returns 需要等待的毫秒数，0 表示可立即执行
   */
  async acquire(domain: string): Promise<number> {
    const { acquired, waitInfo } = this.attemptAcquire(domain)
    if (!acquired) {
      // 返回建议等待时间，由调用方自行 sleep/重试
      return waitInfo.waitTime
    }
    return 0
  }

  /**
   * 等待并获取许可（带超时保护）
   *
   * @param domain - 域名
   * @param timeout - 最大等待时间 (ms)，默认使用 CIRCUIT_BREAKER.maxWaitTimeout
   * @throws Error 如果等待超时
   */
  async acquireWithWait(domain: string, timeout?: number): Promise<void> {
    // timeout 是“总等待上限”，不是单次 sleep 的上限
    if (timeout !== undefined) {
      // 入口参数校验：避免传入 0/负数/NaN/Infinity 造成逻辑歧义
      if (!Number.isFinite(timeout) || timeout <= 0) {
        throw new Error(
          `[DomainScheduler] timeout 必须是 > 0 的有限数字，当前: ${String(timeout)}`
        )
      }
    }

    const maxWait = timeout ?? CIRCUIT_BREAKER.maxWaitTimeout
    if (!Number.isFinite(maxWait) || maxWait <= 0) {
      // 防御性兜底：避免 maxWaitTimeout 被错误配置
      throw new Error(
        `[DomainScheduler] maxWaitTimeout 必须是 > 0 的有限数字，当前: ${String(maxWait)}`
      )
    }
    const startTime = Date.now()

    // 循环重试：直到成功获取许可或超时
    while (true) {
      const elapsed = Date.now() - startTime
      if (elapsed >= maxWait) {
        throw new Error(`[DomainScheduler] 等待域名 ${domain} 许可超时 (${maxWait}ms)`)
      }

      const { acquired, waitInfo } = this.attemptAcquire(domain)
      if (acquired) return

      const remainingTime = maxWait - elapsed // 剩余可等待时间
      const actualWait = Math.min(waitInfo.waitTime, remainingTime)
      if (actualWait <= 0) {
        throw new Error(`[DomainScheduler] 等待域名 ${domain} 许可超时 (${maxWait}ms)`)
      }

      // 如果主要原因是并发上限，则入队等待 release 唤醒，并用定时器兜底避免“丢唤醒/永等”。
      if (waitInfo.primaryReason === 'concurrent') {
        const waiter = this.enqueueWaiter(domain)
        try {
          // 入队后立刻再试一次：避免在 attemptAcquire 与入队之间刚好发生 release 导致唤醒丢失
          const secondTry = this.attemptAcquire(domain)
          if (secondTry.acquired) return

          await Promise.race([waiter.promise, this.sleep(actualWait)])
        } finally {
          // 若是定时器先触发，需要把等待者从队列移除
          waiter.cancel()
        }
        continue
      }

      // 其他原因（RPS/退避/熔断）主要依赖时间等待
      await this.sleep(actualWait)
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

      // 唤醒等待队列中的下一个请求（预留机制）
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
      // 成功即清零失败计数与退避
      state.failCount = 0
      state.backoffUntil = 0
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

    // 计算指数退避：initialBackoff * 2^(failCount-1)，并限制最大退避
    const backoffMs = Math.min(
      CIRCUIT_BREAKER.initialBackoff * Math.pow(2, state.failCount - 1),
      CIRCUIT_BREAKER.maxBackoff
    )

    // 退避到某个时间点（使用截止时间戳，避免 backoff 值“永远生效”）
    const candidateUntil = Date.now() + backoffMs
    state.backoffUntil = Math.max(state.backoffUntil, candidateUntil)

    // 达到阈值则熔断：在 openDuration 期间拒绝请求
    if (state.failCount >= CIRCUIT_BREAKER.failThreshold) {
      state.circuitOpen = true // 触发熔断
      // 设置熔断恢复时间
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
      // 熔断时间已过：恢复并重置状态
      state.circuitOpen = false // 恢复熔断
      state.failCount = 0 // 重置失败计数
      state.backoffUntil = 0 // 重置退避
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
      // 这些字段用于观察与调参
      activeRequests: state.activeRequests, // 当前活跃请求数
      failCount: state.failCount, // 连续失败次数
      // backoff 对外仍返回“剩余退避毫秒数”（便于展示/监控）
      backoff: Math.max(0, state.backoffUntil - Date.now()),
      circuitOpen: state.circuitOpen, // 熔断状态
      circuitOpenUntil: state.circuitOpen ? state.circuitOpenUntil : null // 熔断恢复时间
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
    // 只移除域名状态；默认配置仍保留在 DEFAULT_LIMITS 中
    this.domains.delete(domain)
  }

  /**
   * 重置所有状态
   */
  resetAll(): void {
    // 清空全部运行时状态与等待队列
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
    // 配置合法性检查：避免把调度器推入“永远无法满足”的状态
    if (config.maxConcurrent !== undefined) {
      if (!Number.isFinite(config.maxConcurrent) || config.maxConcurrent <= 0) {
        throw new Error(
          `[DomainScheduler] maxConcurrent 必须是 > 0 的有限数字，domain=${domain}, 当前: ${String(
            config.maxConcurrent
          )}`
        )
      }
    }
    if (config.rps !== undefined) {
      if (!Number.isFinite(config.rps) || config.rps <= 0) {
        throw new Error(
          `[DomainScheduler] rps 必须是 > 0 的有限数字，domain=${domain}, 当前: ${String(config.rps)}`
        )
      }
    }

    // 允许在运行时覆盖/注入单域名配置（也会写入 DEFAULT_LIMITS 作为缓存）
    const currentConfig = this.getLimitConfig(domain)
    DEFAULT_LIMITS[domain] = { ...currentConfig, ...config }

    // 同步更新现有运行时状态，确保新配置即时生效
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
   * 设置熔断配置
   *
   * @param config - 熔断配置（秒为单位）
   */
  setCircuitBreakerConfig(config: {
    failThreshold?: number // 失败阈值
    openDuration?: number // 熔断持续时间（秒）
    maxBackoff?: number // 最大退避时间（秒）
    initialBackoff?: number // 初始退避时间（秒）
  }): void {
    // 约定：入参为“秒”为单位（便于从后台/DB 配置），内部统一转为毫秒
    if (config.failThreshold !== undefined) {
      CIRCUIT_BREAKER.failThreshold = config.failThreshold
    }
    if (config.openDuration !== undefined) {
      // 从秒转换为毫秒
      CIRCUIT_BREAKER.openDuration = config.openDuration * 1000
    }
    if (config.maxBackoff !== undefined) {
      CIRCUIT_BREAKER.maxBackoff = config.maxBackoff * 1000
    }
    if (config.initialBackoff !== undefined) {
      CIRCUIT_BREAKER.initialBackoff = config.initialBackoff * 1000
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
    // 统一去掉 www 前缀，避免同站点被当作不同域名
    return urlObj.hostname.replace(/^www\./, '')
  } catch {
    // URL 解析失败时返回空字符串，由调用方自行处理
    return ''
  }
}

/**
 * 从数据库加载域名限速配置
 */
export async function loadDomainLimitsFromDB(): Promise<number> {
  // 动态导入 prisma：避免在模块初始化阶段产生循环依赖/加载顺序问题
  const { prisma } = await import('../prisma')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // prisma 的模型类型可能在不同运行环境下不稳定，这里用 any 兼容
  const limits = await (prisma as any).domainRateLimit.findMany()

  let applied = 0

  for (const limit of limits) {
    // DB 配置优先级高于 DEFAULT_LIMITS，会覆盖并同步更新运行时状态
    try {
      domainScheduler.setDomainLimit(limit.domain, {
        maxConcurrent: limit.maxConcurrent,
        rps: limit.rps
      })
      applied++
    } catch (err) {
      console.error(
        `[DomainScheduler] 跳过非法域名限速配置: domain=${String(limit.domain)}, maxConcurrent=${String(
          limit.maxConcurrent
        )}, rps=${String(limit.rps)}; err=${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  console.log(
    `[DomainScheduler] 已从数据库加载域名限速配置: 共 ${limits.length} 条，成功应用 ${applied} 条`
  )
  return applied
}

/**
 * 从数据库加载熔断配置
 */
export async function loadCircuitBreakerFromDB(): Promise<void> {
  const { prisma } = await import('../prisma')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // 同上：用 any 兼容 prisma 模型类型差异
  const config = await (prisma as any).systemConfig.findUnique({
    where: { key: 'circuitBreaker' }
  })

  if (config) {
    // value 结构示例：{"failThreshold":5,"openDuration":300,"maxBackoff":60,"initialBackoff":1}
    const parsed = JSON.parse(config.value)
    domainScheduler.setCircuitBreakerConfig(parsed)
    console.log(`[DomainScheduler] 已从数据库加载熔断配置: failThreshold=${parsed.failThreshold}, openDuration=${parsed.openDuration}s`)
  }
}
