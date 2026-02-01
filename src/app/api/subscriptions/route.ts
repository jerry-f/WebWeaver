import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 获取用户订阅列表
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: session.user.id },
    include: {
      source: {
        include: {
          _count: { select: { articles: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json({ subscriptions })
}

// 添加订阅
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { sourceId } = await req.json()
  if (!sourceId) {
    return NextResponse.json({ error: '缺少 sourceId' }, { status: 400 })
  }

  // 检查源是否存在
  const source = await prisma.source.findUnique({ where: { id: sourceId } })
  if (!source) {
    return NextResponse.json({ error: '源不存在' }, { status: 404 })
  }

  // 创建订阅（如果已存在则忽略）
  const subscription = await prisma.subscription.upsert({
    where: {
      userId_sourceId: {
        userId: session.user.id,
        sourceId
      }
    },
    create: {
      userId: session.user.id,
      sourceId
    },
    update: {},
    include: {
      source: {
        include: {
          _count: { select: { articles: true } }
        }
      }
    }
  })

  return NextResponse.json({ subscription })
}
