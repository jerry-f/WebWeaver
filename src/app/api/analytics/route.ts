import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 获取统计数据
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') || '7')

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  startDate.setHours(0, 0, 0, 0)

  // 获取基础统计
  const [totalArticles, totalSources, totalUsers, totalSubscriptions] = await Promise.all([
    prisma.article.count(),
    prisma.source.count(),
    prisma.user.count(),
    prisma.subscription.count(),
  ])

  // 按天统计文章数量
  const articles = await prisma.article.findMany({
    where: {
      fetchedAt: { gte: startDate }
    },
    select: {
      fetchedAt: true,
      sourceId: true,
      read: true
    }
  })

  // 按日期分组统计
  const dailyStats: Record<string, { date: string; articles: number; read: number }> = {}
  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    dailyStats[dateStr] = { date: dateStr, articles: 0, read: 0 }
  }

  articles.forEach(article => {
    const dateStr = article.fetchedAt.toISOString().split('T')[0]
    if (dailyStats[dateStr]) {
      dailyStats[dateStr].articles++
      if (article.read) {
        dailyStats[dateStr].read++
      }
    }
  })

  const chartData = Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date))

  // 按来源统计文章数量
  const sourceStats = await prisma.source.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      _count: {
        select: { articles: true, subscriptions: true }
      }
    },
    orderBy: {
      articles: { _count: 'desc' }
    },
    take: 10
  })

  // 按类型统计
  const typeStats = await prisma.source.groupBy({
    by: ['type'],
    _count: { id: true }
  })

  return NextResponse.json({
    overview: {
      totalArticles,
      totalSources,
      totalUsers,
      totalSubscriptions,
      articlesThisWeek: articles.length,
    },
    chartData,
    sourceStats: sourceStats.map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      articles: s._count.articles,
      subscribers: s._count.subscriptions
    })),
    typeStats: typeStats.map(t => ({
      type: t.type,
      count: t._count.id
    }))
  })
}
