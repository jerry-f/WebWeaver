import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 获取源市场（所有可订阅的源，标记用户是否已订阅）
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('q')
  const type = searchParams.get('type')

  // 构建查询条件
  const where: Record<string, unknown> = { enabled: true }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { url: { contains: search } }
    ]
  }
  if (type) {
    where.type = type
  }

  // 获取所有启用的源
  const sources = await prisma.source.findMany({
    where,
    include: {
      _count: { select: { articles: true, subscriptions: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  // 获取用户已订阅的源 ID
  const userSubscriptions = await prisma.subscription.findMany({
    where: { userId: session.user.id },
    select: { sourceId: true }
  })
  const subscribedIds = new Set(userSubscriptions.map(s => s.sourceId))

  // 标记是否已订阅
  const result = sources.map(source => ({
    ...source,
    subscribed: subscribedIds.has(source.id)
  }))

  return NextResponse.json({ sources: result })
}
