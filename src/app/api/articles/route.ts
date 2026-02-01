import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sourceId = searchParams.get('sourceId')
  const unreadOnly = searchParams.get('unread') === 'true'
  const starredOnly = searchParams.get('starred') === 'true'
  const search = searchParams.get('q')
  const limit = parseInt(searchParams.get('limit') || '50')
  const cursor = searchParams.get('cursor')
  
  const where: Record<string, unknown> = {}
  if (sourceId) where.sourceId = sourceId
  if (unreadOnly) where.read = false
  if (starredOnly) where.starred = true
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { content: { contains: search } }
    ]
  }
  
  const articles = await prisma.article.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    include: {
      source: {
        select: { name: true }
      }
    }
  })
  
  let nextCursor: string | undefined
  if (articles.length > limit) {
    const next = articles.pop()
    nextCursor = next?.id
  }
  
  return NextResponse.json({ articles, nextCursor })
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
