/**
 * 抓取任务 Worker
 *
 * 处理队列中的抓取任务
 */

import { Worker, Job } from 'bullmq'
import { getRedisConnection } from './redis'
import { QUEUE_NAMES, type FetchJobData, type SummaryJobData } from './queues'
import { fetchWithPipeline } from '../fetchers/clients/pipeline'
import { fetchWithGoScraper, checkGoScraperHealth } from '../fetchers/clients/go-scraper'
import { prisma } from '../prisma'

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
 * 启动所有 Worker
 */
export function startAllWorkers(config: WorkerConfig = {}): void {
  startFetchWorker(config)
  startSummaryWorker(config)
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
  console.log('[Workers] All workers stopped')
}
