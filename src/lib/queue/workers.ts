/**
 * 抓取任务 Worker
 *
 * 处理队列中的抓取任务
 */

import { Worker, Job } from 'bullmq'
import { getRedisConnection } from './redis'
import { QUEUE_NAMES, type FetchJobData, type SummaryJobData, type CredentialJobData } from './queues'
import { fetchWithPipeline } from '../fetchers/clients/pipeline'
import { fetchWithGoScraper, checkGoScraperHealth } from '../fetchers/clients/go-scraper'
import { prisma } from '../prisma'
import { refreshExpiredCredentials, refreshCredential } from '../tasks/refresh-credentials'

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
 */
async function processFetchJob(job: Job<FetchJobData>): Promise<void> {
  const { articleId, url, strategy } = job.data

  console.log(`[FetchWorker] Processing job ${job.id}: ${url}`)

  try {
    let result = null

    // 根据策略选择抓取方式
    if (strategy === 'go') {
      // 使用 Go 抓取服务
      const goAvailable = await checkGoScraperHealth()
      if (goAvailable) {
        result = await fetchWithGoScraper(url)
      }
    }

    // 回退到 Pipeline（自动选择策略）
    if (!result) {
      result = await fetchWithPipeline(url)
    }

    if (!result) {
      throw new Error('Failed to fetch content')
    }

    // 更新数据库
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

    console.log(`[FetchWorker] Completed job ${job.id}: ${result.strategy}, ${result.duration}ms`)
  } catch (error) {
    console.error(`[FetchWorker] Failed job ${job.id}:`, error)

    // 更新失败状态
    await prisma.article.update({
      where: { id: articleId },
      data: {
        contentStatus: 'failed'
      }
    })

    throw error
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
