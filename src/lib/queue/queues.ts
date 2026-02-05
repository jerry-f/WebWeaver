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
 * 源抓取任务数据（RSS/Scrape/SiteCrawl 列表抓取）
 */
export interface SourceFetchJobData {
  /** 任务 ID，用于状态追踪 */
  jobId: string
  /** 信息源 ID */
  sourceId: string
  /** 触发方式 */
  triggeredBy: 'manual' | 'scheduled'
  /** 强制重抓所有文章 */
  force?: boolean
}

/**
 * 队列名称
 */
export const QUEUE_NAMES = {
  // 第一层：源级别任务
  SOURCE_FETCH: 'newsflow-source-fetch',
  // 第二层：文章级别任务
  FETCH: 'newsflow-fetch',
  SUMMARY: 'newsflow-summary',
  IMAGE: 'newsflow-image',
  // 辅助任务
  CREDENTIAL: 'newsflow-credential',
} as const

/**
 * 默认任务选项
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  // removeOnComplete: {
  //   count: 1000, // 保留最近 1000 条完成记录
  //   age: 24 * 3600 // 24 小时
  // },
  // 完成后立即删除，允许相同 jobId 的任务再次添加
  removeOnComplete: true,
  removeOnFail: {
    count: 5000, // 保留最近 5000 条失败记录
    age: 7 * 24 * 3600, // 7 天
  },
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
 * 源抓取任务队列
 */
let sourceFetchQueue: Queue<SourceFetchJobData> | null = null

/**
 * 获取抓取任务队列
 */
export function getFetchQueue(): Queue<FetchJobData> {
  if (!fetchQueue) {
    fetchQueue = new Queue<FetchJobData>(QUEUE_NAMES.FETCH, {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
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
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
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
          delay: 60000, // 1 分钟
        },
        // removeOnComplete: {
        //   count: 50,
        //   age: 24 * 3600
        // },
        // 完成后立即删除，允许相同 jobId 的任务再次添加
        removeOnComplete: true,
        removeOnFail: {
          count: 100,
          age: 7 * 24 * 3600,
        },
      },
    })
  }
  return credentialQueue
}

/**
 * 获取源抓取任务队列
 */
export function getSourceFetchQueue(): Queue<SourceFetchJobData> {
  if (!sourceFetchQueue) {
    sourceFetchQueue = new Queue<SourceFetchJobData>(QUEUE_NAMES.SOURCE_FETCH, {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })
  }
  return sourceFetchQueue
}

/**
 * 添加抓取任务
 */
export async function addFetchJob(data: FetchJobData): Promise<Job<FetchJobData>> {
  const queue = getFetchQueue()
  const priority = data.priority || 5

  return queue.add(`fetch_${data.articleId}`, data, {
    priority,
    jobId: `fetch_${data.articleId}`,
    // 避免重复任务
    attempts: 3,
  })
}

/**
 * 批量添加抓取任务
 *
 * @param jobs 任务列表
 * @param force 是否强制添加（忽略重复检查，用于强制刷新场景）
 */
export async function addFetchJobs(jobs: FetchJobData[], force = false): Promise<Job<FetchJobData>[]> {
  const queue = getFetchQueue()
  const timestamp = force ? `_${Date.now()}` : ''

  const bulkJobs = jobs.map((data) => ({
    name: `fetch_${data.articleId}`,
    data,
    opts: {
      priority: data.priority || 5,
      jobId: `fetch_${data.articleId}_${timestamp}`
    },
  }))

  const result = await queue.addBulk(bulkJobs)
  return result
}

/**
 * 添加摘要任务
 */
export async function addSummaryJob(data: SummaryJobData): Promise<Job<SummaryJobData>> {
  const queue = getSummaryQueue()
  const priority = data.priority || 5

  return queue.add(`summary_${data.articleId}`, data, {
    priority,
    jobId: `summary_${data.articleId}`,
  })
}

/**
 * 添加源抓取任务
 */
export async function addSourceFetchJob(data: SourceFetchJobData): Promise<Job<SourceFetchJobData>> {
  const queue = getSourceFetchQueue()

  return queue.add(`source_${data.sourceId}`, data, {
    jobId: data.jobId,
  })
}

/**
 * 队列元数据
 */
export const QUEUE_META = {
  sourceFetch: {
    key: 'sourceFetch',
    name: '源抓取',
    description: '抓取 RSS/网页列表',
    icon: 'Rss',
  },
  fetch: {
    key: 'fetch',
    name: '文章抓取',
    description: '抓取文章正文内容',
    icon: 'FileText',
  },
  summary: {
    key: 'summary',
    name: 'AI 摘要',
    description: '生成文章摘要',
    icon: 'Sparkles',
  },
  credential: {
    key: 'credential',
    name: '凭证刷新',
    description: '刷新登录凭证',
    icon: 'Key',
  },
} as const

export type QueueKey = keyof typeof QUEUE_META

/**
 * 获取队列实例（通用方法）
 */
export function getQueueByKey(key: QueueKey): Queue {
  switch (key) {
    case 'sourceFetch':
      return getSourceFetchQueue()
    case 'fetch':
      return getFetchQueue()
    case 'summary':
      return getSummaryQueue()
    case 'credential':
      return getCredentialQueue()
  }
}

/**
 * 获取队列状态
 */
export async function getQueueStats() {
  const fetchQ = getFetchQueue()
  const sourceFetchQ = getSourceFetchQueue()
  const summaryQ = getSummaryQueue()
  const credentialQ = getCredentialQueue()

  const [
    fetchCounts,
    sourceFetchCounts,
    summaryCounts,
    credentialCounts,
    fetchPaused,
    sourceFetchPaused,
    summaryPaused,
    credentialPaused,
  ] = await Promise.all([
    fetchQ.getJobCounts(),
    sourceFetchQ.getJobCounts(),
    summaryQ.getJobCounts(),
    credentialQ.getJobCounts(),
    fetchQ.isPaused(),
    sourceFetchQ.isPaused(),
    summaryQ.isPaused(),
    credentialQ.isPaused(),
  ])

  return {
    fetch: { ...fetchCounts, isPaused: fetchPaused },
    sourceFetch: { ...sourceFetchCounts, isPaused: sourceFetchPaused },
    summary: { ...summaryCounts, isPaused: summaryPaused },
    credential: { ...credentialCounts, isPaused: credentialPaused },
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
    credentialQ.obliterate({ force: true }),
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
