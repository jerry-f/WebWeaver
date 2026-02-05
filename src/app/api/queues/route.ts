/**
 * 队列管理 API
 *
 * GET - 获取所有队列状态
 * POST - 队列操作（暂停/恢复/清空）
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getQueueStats,
  getQueueByKey,
  QUEUE_META,
  type QueueKey
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
 * GET - 获取所有队列状态
 */
export async function GET() {
  const auth = await checkAdminAuth()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const stats = await getQueueStats()

    // 组装队列信息
    const queues = Object.entries(QUEUE_META).map(([key, meta]) => {
      const counts = stats[key as QueueKey]
      return {
        ...meta,
        ...counts
      }
    })

    return NextResponse.json({
      queues,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取队列状态失败:', error)
    return NextResponse.json(
      { error: '获取队列状态失败' },
      { status: 500 }
    )
  }
}

/**
 * POST - 队列操作
 * body: { action: 'pause' | 'resume' | 'clean', queue: QueueKey }
 */
export async function POST(request: NextRequest) {
  const auth = await checkAdminAuth()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { action, queue: queueKey } = body as {
      action: 'pause' | 'resume' | 'clean'
      queue: QueueKey
    }

    // 验证队列名称
    if (!QUEUE_META[queueKey]) {
      return NextResponse.json(
        { error: '无效的队列名称' },
        { status: 400 }
      )
    }

    const queue = getQueueByKey(queueKey)

    switch (action) {
      case 'pause':
        await queue.pause()
        return NextResponse.json({
          success: true,
          message: `队列 ${QUEUE_META[queueKey].name} 已暂停`
        })

      case 'resume':
        await queue.resume()
        return NextResponse.json({
          success: true,
          message: `队列 ${QUEUE_META[queueKey].name} 已恢复`
        })

      case 'clean':
        // 清理等待中和延迟的任务
        const [waitingCount, delayedCount] = await Promise.all([
          queue.clean(0, 1000, 'wait'),
          queue.clean(0, 1000, 'delayed')
        ])
        return NextResponse.json({
          success: true,
          message: `已清理 ${waitingCount.length + delayedCount.length} 个任务`,
          cleaned: {
            waiting: waitingCount.length,
            delayed: delayedCount.length
          }
        })

      default:
        return NextResponse.json(
          { error: '无效的操作' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('队列操作失败:', error)
    return NextResponse.json(
      { error: '队列操作失败' },
      { status: 500 }
    )
  }
}
