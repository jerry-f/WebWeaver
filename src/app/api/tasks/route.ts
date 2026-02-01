import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 获取任务列表
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  })
  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const tasks = await prisma.task.findMany({
    include: {
      logs: {
        orderBy: { createdAt: 'desc' },
        take: 5
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json({ tasks })
}

// 创建任务
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  })
  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const { name, type, schedule, enabled } = await req.json()
  if (!name || !type || !schedule) {
    return NextResponse.json({ error: '缺少必填字段' }, { status: 400 })
  }

  const task = await prisma.task.create({
    data: {
      name,
      type,
      schedule,
      enabled: enabled ?? true
    }
  })

  return NextResponse.json({ task })
}

// 更新任务
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  })
  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const { taskId, enabled, schedule, name } = await req.json()
  if (!taskId) {
    return NextResponse.json({ error: '缺少 taskId' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (enabled !== undefined) updateData.enabled = enabled
  if (schedule) updateData.schedule = schedule
  if (name) updateData.name = name

  const task = await prisma.task.update({
    where: { id: taskId },
    data: updateData
  })

  return NextResponse.json({ task })
}

// 删除任务
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  })
  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('taskId')
  if (!taskId) {
    return NextResponse.json({ error: '缺少 taskId' }, { status: 400 })
  }

  await prisma.task.delete({ where: { id: taskId } })

  return NextResponse.json({ success: true })
}
