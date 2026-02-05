/**
 * 队列历史统计 API
 *
 * GET - 获取最近 N 小时的执行统计
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getFetchQueue,
  getSourceFetchQueue,
  getSummaryQueue,
  getCredentialQueue
} from '@/lib/queue/queues'

/**
 * 验证管理员权限
 */
async function checkAdminAuth() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return { error: '未登录', status: 401 }
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true }
  })

  if (user?.role !== 'admin') {
    return { error: '权限不足', status: 403 }
  }

  return { user, session }
}

/**
 * 从已完成/失败的任务中统计历史数据
 */
async function getQueueHistory(hours: number = 24) {
  const fetchQ = getFetchQueue()
  const sourceFetchQ = getSourceFetchQueue()
  const summaryQ = getSummaryQueue()
  const credentialQ = getCredentialQueue()

  // 获取已完成和失败的任务（最近的）
  const [
    fetchCompleted,
    fetchFailed,
    sourceFetchCompleted,
    sourceFetchFailed,
    summaryCompleted,
    summaryFailed
  ] = await Promise.all([
    fetchQ.getCompleted(0, 500),
    fetchQ.getFailed(0, 500),
    sourceFetchQ.getCompleted(0, 200),
    sourceFetchQ.getFailed(0, 200),
    summaryQ.getCompleted(0, 200),
    summaryQ.getFailed(0, 200)
  ])

  // 计算时间范围
  const now = Date.now()
  const startTime = now - hours * 60 * 60 * 1000

  // 按小时分组统计
  const hourlyStats: Record<string, {
    hour: string
    completed: number
    failed: number
    avgDuration: number
    durations: number[]
  }> = {}

  // 初始化每个小时的统计
  for (let i = 0; i < hours; i++) {
    const hourTime = new Date(now - i * 60 * 60 * 1000)
    const hourKey = hourTime.toISOString().slice(0, 13) // YYYY-MM-DDTHH
    hourlyStats[hourKey] = {
      hour: hourKey,
      completed: 0,
      failed: 0,
      avgDuration: 0,
      durations: []
    }
  }

  // 处理完成的任务
  const allCompleted = [...fetchCompleted, ...sourceFetchCompleted, ...summaryCompleted]
  for (const job of allCompleted) {
    if (job.finishedOn && job.finishedOn >= startTime) {
      const hourKey = new Date(job.finishedOn).toISOString().slice(0, 13)
      if (hourlyStats[hourKey]) {
        hourlyStats[hourKey].completed++
        if (job.processedOn && job.finishedOn) {
          hourlyStats[hourKey].durations.push(job.finishedOn - job.processedOn)
        }
      }
    }
  }

  // 处理失败的任务
  const allFailed = [...fetchFailed, ...sourceFetchFailed, ...summaryFailed]
  for (const job of allFailed) {
    if (job.finishedOn && job.finishedOn >= startTime) {
      const hourKey = new Date(job.finishedOn).toISOString().slice(0, 13)
      if (hourlyStats[hourKey]) {
        hourlyStats[hourKey].failed++
      }
    }
  }

  // 计算平均耗时
  for (const stats of Object.values(hourlyStats)) {
    if (stats.durations.length > 0) {
      stats.avgDuration = Math.round(
        stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length
      )
    }
  }

  // 转换为数组并排序
  const history = Object.values(hourlyStats)
    .map(({ hour, completed, failed, avgDuration }) => ({
      hour,
      completed,
      failed,
      avgDuration
    }))
    .sort((a, b) => a.hour.localeCompare(b.hour))

  // 计算汇总
  const summary = {
    totalCompleted: allCompleted.filter(j => j.finishedOn && j.finishedOn >= startTime).length,
    totalFailed: allFailed.filter(j => j.finishedOn && j.finishedOn >= startTime).length,
    avgDuration: 0
  }

  const allDurations = allCompleted
    .filter(j => j.processedOn && j.finishedOn && j.finishedOn >= startTime)
    .map(j => j.finishedOn! - j.processedOn!)

  if (allDurations.length > 0) {
    summary.avgDuration = Math.round(
      allDurations.reduce((a, b) => a + b, 0) / allDurations.length
    )
  }

  return { history, summary }
}

/**
 * GET - 获取历史统计数据
 */
export async function GET(request: NextRequest) {
  const auth = await checkAdminAuth()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const searchParams = request.nextUrl.searchParams
  const hours = parseInt(searchParams.get('hours') || '24', 10)

  try {
    const { history, summary } = await getQueueHistory(Math.min(hours, 72))

    return NextResponse.json({
      history,
      summary,
      hours,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取历史统计失败:', error)
    return NextResponse.json(
      { error: '获取历史统计失败' },
      { status: 500 }
    )
  }
}
