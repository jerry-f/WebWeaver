import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 获取用户列表（仅管理员）
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  // 检查管理员权限
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  })
  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      _count: {
        select: {
          subscriptions: true,
          bookmarks: true,
          readHistory: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json({ users })
}

// 更新用户（仅管理员）
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

  const { userId, role, name } = await req.json()
  if (!userId) {
    return NextResponse.json({ error: '缺少 userId' }, { status: 400 })
  }

  // 不能修改自己的角色
  if (userId === session.user.id && role) {
    return NextResponse.json({ error: '不能修改自己的角色' }, { status: 400 })
  }

  const updateData: Record<string, string> = {}
  if (role) updateData.role = role
  if (name !== undefined) updateData.name = name

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true
    }
  })

  return NextResponse.json({ user })
}

// 删除用户（仅管理员）
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
  const userId = searchParams.get('userId')
  if (!userId) {
    return NextResponse.json({ error: '缺少 userId' }, { status: 400 })
  }

  // 不能删除自己
  if (userId === session.user.id) {
    return NextResponse.json({ error: '不能删除自己' }, { status: 400 })
  }

  await prisma.user.delete({ where: { id: userId } })

  return NextResponse.json({ success: true })
}
