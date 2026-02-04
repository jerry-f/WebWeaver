/**
 * 任务详情 API
 *
 * GET - 获取单个任务详情
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

/**
 * GET - 获取单个任务详情
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ queue: string; jobId: string }> }
) {
  const auth = await checkAdminAuth()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { queue: queueKey, jobId } = await params

  // 验证队列名称
  if (!QUEUE_META[queueKey as QueueKey]) {
    return NextResponse.json(
      { error: '无效的队列名称' },
      { status: 400 }
    )
  }

  try {
    const queue = getQueueByKey(queueKey as QueueKey)
    const job = await queue.getJob(jobId)

    if (!job) {
      return NextResponse.json(
        { error: '任务不存在' },
        { status: 404 }
      )
    }

    // 获取任务状态
    const state = await job.getState()

    // 获取日志
    const logs = await queue.getJobLogs(jobId)

    return NextResponse.json({
      job: {
        id: job.id,
        name: job.name,
        data: job.data,
        status: state,
        attemptsMade: job.attemptsMade,
        attemptsTotal: job.opts?.attempts || 3,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        progress: job.progress,
        delay: job.delay,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        opts: {
          priority: job.opts?.priority,
          delay: job.opts?.delay,
          attempts: job.opts?.attempts
        },
        logs: logs.logs
      }
    })
  } catch (error) {
    console.error('获取任务详情失败:', error)
    return NextResponse.json(
      { error: '获取任务详情失败' },
      { status: 500 }
    )
  }
}

/**
 * POST - 任务操作（重试/删除）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ queue: string; jobId: string }> }
) {
  const auth = await checkAdminAuth()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { queue: queueKey, jobId } = await params

  // 验证队列名称
  if (!QUEUE_META[queueKey as QueueKey]) {
    return NextResponse.json(
      { error: '无效的队列名称' },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    const { action } = body as { action: 'retry' | 'remove' }

    const queue = getQueueByKey(queueKey as QueueKey)
    const job = await queue.getJob(jobId)

    if (!job) {
      return NextResponse.json(
        { error: '任务不存在' },
        { status: 404 }
      )
    }

    switch (action) {
      case 'retry':
        await job.retry()
        return NextResponse.json({
          success: true,
          message: '任务已重新加入队列'
        })

      case 'remove':
        await job.remove()
        return NextResponse.json({
          success: true,
          message: '任务已删除'
        })

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
