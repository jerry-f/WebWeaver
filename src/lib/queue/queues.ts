/**
 * 抓取任务队列
 *
 * 使用 BullMQ 实现异步任务处理
 */

import { Queue, Job } from 'bullmq'
import { getRedisConnection } from './redis'
import type { FetchStrategy } from '../fetchers/types'

/**
 * 抓取任务数据
 */
export interface FetchJobData {
  /** 文章 ID */
  articleId: string
  /** 文章 URL */
  url: string
  /** 信息源 ID */
  sourceId: string
  /** 抓取策略 */
  strategy?: FetchStrategy
  /** 优先级 (1-10, 1 最高) */
  priority?: number
  /** 重试次数 */
  retryCount?: number
}

/**
 * AI 摘要任务数据
 */
export interface SummaryJobData {
  /** 文章 ID */
  articleId: string
  /** 文章内容 */
  content: string
  /** 优先级 */
  priority?: number
}

/**
 * 凭证刷新任务数据
 */
export interface CredentialJobData {
  /** 任务 ID（来自 Task 表） */
  taskId?: string
  /** 是否手动触发 */
  manual?: boolean
  /** 指定凭证 ID（可选，不指定则刷新所有过期凭证） */
  credentialId?: string
}

/**
 * 队列名称
 */
export const QUEUE_NAMES = {
  FETCH: 'newsflow-fetch',
  SUMMARY: 'newsflow-summary',
  IMAGE: 'newsflow-image',
  CREDENTIAL: 'newsflow-credential'
} as const

/**
 * 默认任务选项
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600 // 24 小时
  },
  removeOnFail: {
    count: 5000,
    age: 7 * 24 * 3600 // 7 天
  }
}

/**
 * 抓取任务队列
 */
let fetchQueue: Queue<FetchJobData> | null = null

/**
 * AI 摘要任务队列
 */
let summaryQueue: Queue<SummaryJobData> | null = null

/**
 * 凭证刷新任务队列
 */
let credentialQueue: Queue<CredentialJobData> | null = null

/**
 * 获取抓取任务队列
 */
export function getFetchQueue(): Queue<FetchJobData> {
  if (!fetchQueue) {
    fetchQueue = new Queue<FetchJobData>(QUEUE_NAMES.FETCH, {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS
    })
  }
  return fetchQueue
}

/**
 * 获取摘要任务队列
 */
export function getSummaryQueue(): Queue<SummaryJobData> {
  if (!summaryQueue) {
    summaryQueue = new Queue<SummaryJobData>(QUEUE_NAMES.SUMMARY, {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS
    })
  }
  return summaryQueue
}

/**
 * 获取凭证刷新队列
 */
export function getCredentialQueue(): Queue<CredentialJobData> {
  if (!credentialQueue) {
    credentialQueue = new Queue<CredentialJobData>(QUEUE_NAMES.CREDENTIAL, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential' as const,
          delay: 60000 // 1 分钟
        },
        removeOnComplete: {
          count: 50,
          age: 24 * 3600
        },
        removeOnFail: {
          count: 100,
          age: 7 * 24 * 3600
        }
      }
    })
  }
  return credentialQueue
}

/**
 * 添加抓取任务
 */
export async function addFetchJob(data: FetchJobData): Promise<Job<FetchJobData>> {
  const queue = getFetchQueue()
  const priority = data.priority || 5

  return queue.add(`fetch:${data.articleId}`, data, {
    priority,
    jobId: `fetch:${data.articleId}`,
    // 避免重复任务
    attempts: 3
  })
}

/**
 * 批量添加抓取任务
 */
export async function addFetchJobs(jobs: FetchJobData[]): Promise<Job<FetchJobData>[]> {
  const queue = getFetchQueue()

  const bulkJobs = jobs.map(data => ({
    name: `fetch:${data.articleId}`,
    data,
    opts: {
      priority: data.priority || 5,
      jobId: `fetch:${data.articleId}`
    }
  }))

  return queue.addBulk(bulkJobs)
}

/**
 * 添加摘要任务
 */
export async function addSummaryJob(data: SummaryJobData): Promise<Job<SummaryJobData>> {
  const queue = getSummaryQueue()
  const priority = data.priority || 5

  return queue.add(`summary:${data.articleId}`, data, {
    priority,
    jobId: `summary:${data.articleId}`
  })
}

/**
 * 获取队列状态
 */
export async function getQueueStats() {
  const fetchQ = getFetchQueue()
  const summaryQ = getSummaryQueue()
  const credentialQ = getCredentialQueue()

  const [fetchCounts, summaryCounts, credentialCounts] = await Promise.all([
    fetchQ.getJobCounts(),
    summaryQ.getJobCounts(),
    credentialQ.getJobCounts()
  ])

  return {
    fetch: fetchCounts,
    summary: summaryCounts,
    credential: credentialCounts
  }
}

/**
 * 清理队列（开发用）
 */
export async function cleanQueues(): Promise<void> {
  const fetchQ = getFetchQueue()
  const summaryQ = getSummaryQueue()
  const credentialQ = getCredentialQueue()

  await Promise.all([
    fetchQ.obliterate({ force: true }),
    summaryQ.obliterate({ force: true }),
    credentialQ.obliterate({ force: true })
  ])
}

/**
 * 关闭队列连接
 */
export async function closeQueues(): Promise<void> {
  if (fetchQueue) {
    await fetchQueue.close()
    fetchQueue = null
  }
  if (summaryQueue) {
    await summaryQueue.close()
    summaryQueue = null
  }
  if (credentialQueue) {
    await credentialQueue.close()
    credentialQueue = null
  }
}
