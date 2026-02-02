'use client'

/**
 * 任务状态订阅 Hook
 *
 * 通过 SSE 订阅任务进度更新
 */

import { useState, useEffect, useCallback } from 'react'

/**
 * 任务状态类型
 */
export type JobStatus = 'started' | 'progress' | 'completed' | 'failed'

/**
 * 任务状态消息
 */
export interface JobStatusMessage {
  jobId: string
  sourceId: string
  type: 'source_fetch' | 'crawl_discovery' | 'article_fetch'
  status: JobStatus
  progress?: {
    current: number
    total: number
    added?: number
    queued?: number
  }
  error?: string
  timestamp: number
}

/**
 * Hook 返回值
 */
export interface UseJobStatusReturn {
  /** 当前状态 */
  status: JobStatusMessage | null
  /** 是否正在加载 */
  isLoading: boolean
  /** 是否已完成 */
  isCompleted: boolean
  /** 是否失败 */
  isFailed: boolean
  /** 错误信息 */
  error: string | null
  /** 重置状态 */
  reset: () => void
}

/**
 * 订阅任务状态更新
 *
 * @param jobId - 任务 ID，为 null 时不订阅
 * @returns 任务状态
 *
 * @example
 * ```tsx
 * const { status, isLoading, isCompleted } = useJobStatus(jobId)
 *
 * if (isLoading) return <Spinner />
 * if (isCompleted) return <Success added={status?.progress?.added} />
 * ```
 */
export function useJobStatus(jobId: string | null): UseJobStatusReturn {
  const [status, setStatus] = useState<JobStatusMessage | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setStatus(null)
    setIsLoading(false)
    setError(null)
  }, [])

  useEffect(() => {
    if (!jobId) {
      reset()
      return
    }

    setIsLoading(true)
    setError(null)

    const eventSource = new EventSource(`/api/jobs/${jobId}/events`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        // 处理连接确认
        if (data.type === 'connected') {
          return
        }

        // 处理超时
        if (data.type === 'timeout') {
          setError('连接超时')
          setIsLoading(false)
          eventSource.close()
          return
        }

        // 更新状态
        setStatus(data as JobStatusMessage)

        // 任务结束
        if (data.status === 'completed' || data.status === 'failed') {
          setIsLoading(false)
          if (data.status === 'failed') {
            setError(data.error || '任务失败')
          }
          eventSource.close()
        }
      } catch (err) {
        console.error('[useJobStatus] Failed to parse message:', err)
      }
    }

    eventSource.onerror = () => {
      setError('连接失败')
      setIsLoading(false)
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [jobId, reset])

  return {
    status,
    isLoading,
    isCompleted: status?.status === 'completed',
    isFailed: status?.status === 'failed',
    error,
    reset
  }
}

/**
 * 触发抓取并订阅状态
 *
 * @returns 抓取控制方法
 *
 * @example
 * ```tsx
 * const { fetch, status, isLoading } = useFetchSource()
 *
 * <Button onClick={() => fetch(sourceId)} disabled={isLoading}>
 *   {isLoading ? '抓取中...' : '抓取'}
 * </Button>
 * ```
 */
export function useFetchSource() {
  const [jobId, setJobId] = useState<string | null>(null)
  const jobStatus = useJobStatus(jobId)

  const fetch = useCallback(async (sourceId: string) => {
    try {
      const response = await globalThis.fetch(`/api/sources/${sourceId}/fetch`, {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('抓取请求失败')
      }

      const data = await response.json()
      setJobId(data.jobId)
    } catch (err) {
      console.error('[useFetchSource] Failed to fetch:', err)
    }
  }, [])

  const reset = useCallback(() => {
    setJobId(null)
    jobStatus.reset()
  }, [jobStatus])

  return {
    fetch,
    jobId,
    ...jobStatus,
    reset
  }
}
