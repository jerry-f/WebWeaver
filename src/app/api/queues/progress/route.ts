/**
 * 活跃任务进度 API
 *
 * GET - 获取所有活跃任务的进度信息
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveJobsProgress } from '@/lib/queue/redis'

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
 * GET - 获取所有活跃任务的进度
 */
export async function GET() {
  const auth = await checkAdminAuth()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const progress = await getActiveJobsProgress()

    return NextResponse.json({
      progress,
      count: progress.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取任务进度失败:', error)
    return NextResponse.json(
      { error: '获取任务进度失败' },
      { status: 500 }
    )
  }
}
