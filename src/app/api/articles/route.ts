import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    const { searchParams } = new URL(req.url)
    // 支持多选：sourceId 可以是逗号分隔的多个 ID
    const sourceIdParam = searchParams.get('sourceId')
    const sourceIds = sourceIdParam ? sourceIdParam.split(',').filter(Boolean) : []
    // 支持多选：category 可以是逗号分隔的多个分类
    const categoryParam = searchParams.get('category')
    const categories = categoryParam ? categoryParam.split(',').filter(Boolean) : []

    const unreadOnly = searchParams.get('unread') === 'true'
    const starredOnly = searchParams.get('starred') === 'true'
    const subscribedOnly = searchParams.get('subscribed') === 'true'
    const search = searchParams.get('q')
    const limit = parseInt(searchParams.get('limit') || '50')
    const page = parseInt(searchParams.get('page') || '1')
    const cursor = searchParams.get('cursor')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}

    // 多选来源筛选
    if (sourceIds.length === 1) {
      where.sourceId = sourceIds[0]
    } else if (sourceIds.length > 1) {
      where.sourceId = { in: sourceIds }
    }

    // 多选分类筛选 - 通过关联的 Source.category 筛选
    if (categories.length > 0) {
      where.source = {
        category: categories.length === 1 ? categories[0] : { in: categories }
      }
    }

    if (unreadOnly) where.read = false
    if (starredOnly) where.starred = true
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } }
      ]
    }

    // 按用户订阅过滤文章
    if (subscribedOnly && session?.user?.id) {
      const subscriptions = await prisma.subscription.findMany({
        where: { userId: session.user.id },
        select: { sourceId: true }
      })
      const subscribedSourceIds = subscriptions.map(s => s.sourceId)
      where.sourceId = { in: subscribedSourceIds }
    }

    // 计算总数（用于分页）
    const total = await prisma.article.count({ where })
    const totalPages = Math.ceil(total / limit)
    const skip = (page - 1) * limit

    const articles = await prisma.article.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: limit + 1,
      skip: cursor ? undefined : skip,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        source: {
          select: { id: true, name: true, category: true }
        }
      }
    })

    let nextCursor: string | undefined
    if (articles.length > limit) {
      const next = articles.pop()
      nextCursor = next?.id
    }

    return NextResponse.json({
      articles,
      nextCursor,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    })
  } catch (error) {
    console.error('获取文章失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return NextResponse.json({ error: '获取文章失败', message: errorMessage, articles: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }, { status: 500 })
  }
}

// Mark all as read
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sourceId = searchParams.get('sourceId')
  
  const where: Record<string, unknown> = { read: false }
  if (sourceId) where.sourceId = sourceId
  
  const result = await prisma.article.updateMany({
    where,
    data: { read: true }
  })
  
  return NextResponse.json({ updated: result.count })
}
