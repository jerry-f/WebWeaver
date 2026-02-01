import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 取消订阅
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { id } = await params

  // 检查订阅是否属于当前用户
  const subscription = await prisma.subscription.findUnique({
    where: { id }
  })

  if (!subscription) {
    return NextResponse.json({ error: '订阅不存在' }, { status: 404 })
  }

  if (subscription.userId !== session.user.id) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  await prisma.subscription.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
