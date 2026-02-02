/**
 * 抓取任务 Worker
 *
 * 处理队列中的抓取任务
 */

import { Worker, Job } from 'bullmq'
import { getRedisConnection } from './redis'
import { QUEUE_NAMES, type FetchJobData, type SummaryJobData, type CredentialJobData } from './queues'
import { getUnifiedFetcher } from '../fetchers/unified-fetcher'
import { domainScheduler, extractDomainFromUrl } from '../scheduler/domain-scheduler'
import { prisma } from '../prisma'
import { refreshExpiredCredentials, refreshCredential } from '../tasks/refresh-credentials'
import { queueArticleForSummary } from '../ai/queue'

/**
 * Worker 配置
 */
export interface WorkerConfig {
  /** 并发数 */
  concurrency?: number
  /** 是否启用 */
  enabled?: boolean
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: WorkerConfig = {
  concurrency: 5,
  enabled: true
}

/**
 * 抓取任务处理函数
 *
 * 集成域名调度器进行限速和熔断保护
 */
async function processFetchJob(job: Job<FetchJobData>): Promise<void> {
  const { articleId, url, sourceId, strategy } = job.data
  const domain = extractDomainFromUrl(url)

  console.log(`[FetchWorker] Processing job ${job.id}: ${url} (domain: ${domain})`)

  // 1. 检查熔断状态
  if (domainScheduler.isCircuitOpen(domain)) {
    console.warn(`[FetchWorker] Domain ${domain} is circuit-open, skipping job ${job.id}`)
    throw new Error(`Domain ${domain} is temporarily blocked due to repeated failures`)
  }

  // 2. 获取域名许可（等待限速）
  await domainScheduler.acquireWithWait(domain)

  try {
    // 3. 使用统一抓取器（自动处理凭证和策略选择）
    const fetcher = getUnifiedFetcher()
    const result = await fetcher.fetch(url, {
      sourceId,
      strategy: strategy || 'auto',
      timeout: 30000
    })

    if (result.success && result.content) {
      // 4. 更新数据库
      await prisma.article.update({
        where: { id: articleId },
        data: {
          content: result.content,
          textContent: result.textContent,
          contentStatus: 'completed',
          fetchStrategy: result.strategy,
          fetchDuration: result.duration
        }
      })

      // 5. 报告成功（重置退避）
      domainScheduler.reportSuccess(domain)

      // 6. 将文章加入 AI 摘要队列
      queueArticleForSummary(articleId)

      console.log(`[FetchWorker] Completed job ${job.id}: ${result.strategy}, ${result.duration}ms`)
    } else {
      throw new Error(result.error || 'Failed to fetch content')
    }
  } catch (error) {
    // 7. 报告失败（触发退避/熔断）
    domainScheduler.reportFailure(domain)

    console.error(`[FetchWorker] Failed job ${job.id}:`, error)

    // 更新失败状态
    await prisma.article.update({
      where: { id: articleId },
      data: {
        contentStatus: 'failed'
      }
    })

    throw error
  } finally {
    // 8. 释放许可
    domainScheduler.release(domain)
  }
}

/**
 * 摘要任务处理函数
 */
async function processSummaryJob(job: Job<SummaryJobData>): Promise<void> {
  const { articleId, content } = job.data

  console.log(`[SummaryWorker] Processing job ${job.id}`)

  try {
    // 这里集成 AI 摘要生成逻辑
    // 暂时跳过，保留接口

    await prisma.article.update({
      where: { id: articleId },
      data: {
        summaryStatus: 'completed'
      }
    })

    console.log(`[SummaryWorker] Completed job ${job.id}`)
  } catch (error) {
    console.error(`[SummaryWorker] Failed job ${job.id}:`, error)

    await prisma.article.update({
      where: { id: articleId },
      data: {
        summaryStatus: 'failed'
      }
    })

    throw error
  }
}

/**
 * Worker 实例
 */
let fetchWorker: Worker<FetchJobData> | null = null
let summaryWorker: Worker<SummaryJobData> | null = null
let credentialWorker: Worker<CredentialJobData> | null = null

/**
 * 凭证刷新任务处理函数
 */
async function processCredentialJob(job: Job<CredentialJobData>): Promise<void> {
  const { taskId, manual, credentialId } = job.data

  console.log(`[CredentialWorker] Processing job ${job.id}${manual ? ' (manual)' : ''}`)

  try {
    let result

    if (credentialId) {
      // 刷新单个凭证
      const singleResult = await refreshCredential(credentialId)
      result = {
        success: singleResult.success ? 1 : 0,
        failed: singleResult.success ? 0 : 1,
        skipped: 0
      }
      console.log(`[CredentialWorker] Single credential refresh: ${singleResult.message}`)
    } else {
      // 刷新所有过期凭证
      result = await refreshExpiredCredentials()
      console.log(`[CredentialWorker] Batch refresh complete: success=${result.success}, failed=${result.failed}, skipped=${result.skipped}`)
    }

    // 如果有关联的任务，更新任务状态
    if (taskId) {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          lastStatus: result.failed === 0 ? 'success' : 'partial',
          lastError: result.failed > 0 ? `${result.failed} 个凭证刷新失败` : null
        }
      })

      // 记录任务日志
      await prisma.taskLog.create({
        data: {
          taskId,
          status: result.failed === 0 ? 'success' : 'partial',
          message: `刷新完成: 成功=${result.success}, 失败=${result.failed}, 跳过=${result.skipped}`,
          duration: Date.now() - job.timestamp
        }
      })
    }
  } catch (error) {
    console.error(`[CredentialWorker] Failed job ${job.id}:`, error)

    if (taskId) {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          lastStatus: 'failed',
          lastError: error instanceof Error ? error.message : 'Unknown error'
        }
      })

      await prisma.taskLog.create({
        data: {
          taskId,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - job.timestamp
        }
      })
    }

    throw error
  }
}

/**
 * 启动抓取 Worker
 */
export function startFetchWorker(config: WorkerConfig = {}): Worker<FetchJobData> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  if (fetchWorker) {
    return fetchWorker
  }

  fetchWorker = new Worker<FetchJobData>(
    QUEUE_NAMES.FETCH,
    processFetchJob,
    {
      connection: getRedisConnection(),
      concurrency: cfg.concurrency
    }
  )

  fetchWorker.on('completed', (job) => {
    console.log(`[FetchWorker] Job ${job.id} completed`)
  })

  fetchWorker.on('failed', (job, error) => {
    console.error(`[FetchWorker] Job ${job?.id} failed:`, error.message)
  })

  fetchWorker.on('error', (error) => {
    console.error('[FetchWorker] Error:', error)
  })

  console.log(`[FetchWorker] Started with concurrency ${cfg.concurrency}`)

  return fetchWorker
}

/**
 * 启动摘要 Worker
 */
export function startSummaryWorker(config: WorkerConfig = {}): Worker<SummaryJobData> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  if (summaryWorker) {
    return summaryWorker
  }

  summaryWorker = new Worker<SummaryJobData>(
    QUEUE_NAMES.SUMMARY,
    processSummaryJob,
    {
      connection: getRedisConnection(),
      concurrency: cfg.concurrency
    }
  )

  summaryWorker.on('completed', (job) => {
    console.log(`[SummaryWorker] Job ${job.id} completed`)
  })

  summaryWorker.on('failed', (job, error) => {
    console.error(`[SummaryWorker] Job ${job?.id} failed:`, error.message)
  })

  console.log(`[SummaryWorker] Started with concurrency ${cfg.concurrency}`)

  return summaryWorker
}

/**
 * 启动凭证刷新 Worker
 */
export function startCredentialWorker(config: WorkerConfig = {}): Worker<CredentialJobData> {
  if (credentialWorker) {
    return credentialWorker
  }

  credentialWorker = new Worker<CredentialJobData>(
    QUEUE_NAMES.CREDENTIAL,
    processCredentialJob,
    {
      connection: getRedisConnection(),
      concurrency: 1 // 凭证刷新只需要单并发
    }
  )

  credentialWorker.on('completed', (job) => {
    console.log(`[CredentialWorker] Job ${job.id} completed`)
  })

  credentialWorker.on('failed', (job, error) => {
    console.error(`[CredentialWorker] Job ${job?.id} failed:`, error.message)
  })

  credentialWorker.on('error', (error) => {
    console.error('[CredentialWorker] Error:', error)
  })

  console.log('[CredentialWorker] Started')

  return credentialWorker
}

/**
 * 启动所有 Worker
 */
export function startAllWorkers(config: WorkerConfig = {}): void {
  startFetchWorker(config)
  startSummaryWorker(config)
  startCredentialWorker(config)
}

/**
 * 停止所有 Worker
 */
export async function stopAllWorkers(): Promise<void> {
  if (fetchWorker) {
    await fetchWorker.close()
    fetchWorker = null
  }
  if (summaryWorker) {
    await summaryWorker.close()
    summaryWorker = null
  }
  if (credentialWorker) {
    await credentialWorker.close()
    credentialWorker = null
  }
  console.log('[Workers] All workers stopped')
}
