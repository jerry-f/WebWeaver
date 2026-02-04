/**
 * 队列任务列表 API
 *
 * GET - 获取指定队列的任务列表
 * POST - 任务操作（重试/删除）
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getQueueByKey, QUEUE_META, type QueueKey } from '@/lib/queue/queues'

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

type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'

/**
 * GET - 获取指定队列的任务列表
 * query: { status, page, limit }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ queue: string }> }
) {
  const auth = await checkAdminAuth()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { queue: queueKey } = await params

  // 验证队列名称
  if (!QUEUE_META[queueKey as QueueKey]) {
    return NextResponse.json(
      { error: '无效的队列名称' },
      { status: 400 }
    )
  }

  const searchParams = request.nextUrl.searchParams
  const status = (searchParams.get('status') || 'failed') as JobStatus
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '20', 10)
  const offset = (page - 1) * limit

  try {
    const queue = getQueueByKey(queueKey as QueueKey)

    // 获取任务列表
    let jobs
    switch (status) {
      case 'waiting':
        jobs = await queue.getWaiting(offset, offset + limit - 1)
        break
      case 'active':
        jobs = await queue.getActive(offset, offset + limit - 1)
        break
      case 'completed':
        jobs = await queue.getCompleted(offset, offset + limit - 1)
        break
      case 'failed':
        jobs = await queue.getFailed(offset, offset + limit - 1)
        break
      case 'delayed':
        jobs = await queue.getDelayed(offset, offset + limit - 1)
        break
      default:
        jobs = await queue.getFailed(offset, offset + limit - 1)
    }

    // 获取总数
    const counts = await queue.getJobCounts()
    const total = counts[status] || 0

    // 格式化任务数据
    const formattedJobs = jobs.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      status: status,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      timestamp: job.timestamp,
      delay: job.delay,
      progress: job.progress
    }))

    return NextResponse.json({
      jobs: formattedJobs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('获取任务列表失败:', error)
    return NextResponse.json(
      { error: '获取任务列表失败' },
      { status: 500 }
    )
  }
}

/**
 * POST - 任务操作
 * body: { action: 'retry' | 'remove' | 'retryAll', jobIds?: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ queue: string }> }
) {
  const auth = await checkAdminAuth()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { queue: queueKey } = await params

  // 验证队列名称
  if (!QUEUE_META[queueKey as QueueKey]) {
    return NextResponse.json(
      { error: '无效的队列名称' },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    const { action, jobIds } = body as {
      action: 'retry' | 'remove' | 'retryAll'
      jobIds?: string[]
    }

    const queue = getQueueByKey(queueKey as QueueKey)

    switch (action) {
      case 'retry': {
        if (!jobIds || jobIds.length === 0) {
          return NextResponse.json(
            { error: '请指定要重试的任务' },
            { status: 400 }
          )
        }

        let retried = 0
        for (const jobId of jobIds) {
          const job = await queue.getJob(jobId)
          if (job) {
            await job.retry()
            retried++
          }
        }

        return NextResponse.json({
          success: true,
          message: `已重试 ${retried} 个任务`
        })
      }

      case 'remove': {
        if (!jobIds || jobIds.length === 0) {
          return NextResponse.json(
            { error: '请指定要删除的任务' },
            { status: 400 }
          )
        }

        let removed = 0
        for (const jobId of jobIds) {
          const job = await queue.getJob(jobId)
          if (job) {
            await job.remove()
            removed++
          }
        }

        return NextResponse.json({
          success: true,
          message: `已删除 ${removed} 个任务`
        })
      }

      case 'retryAll': {
        // 获取所有失败任务并重试
        const failedJobs = await queue.getFailed(0, 1000)
        let retried = 0

        for (const job of failedJobs) {
          await job.retry()
          retried++
        }

        return NextResponse.json({
          success: true,
          message: `已重试 ${retried} 个失败任务`
        })
      }

      default:
        return NextResponse.json(
          { error: '无效的操作' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('任务操作失败:', error)
    return NextResponse.json(
      { error: '任务操作失败' },
      { status: 500 }
    )
  }
}
