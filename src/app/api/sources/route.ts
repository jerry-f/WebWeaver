import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const sources = await prisma.source.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { articles: true }
      }
    }
  })
  return NextResponse.json(sources)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, type, url, category, config } = body

  // 支持两种方式：直接传 type，或通过 URL 自动检测（默认 rss）
  const sourceType = type || 'rss'

  if (!name || !url) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const source = await prisma.source.create({
    data: {
      name,
      type: sourceType,
      url,
      category: category || null,
      config: config ? JSON.stringify(config) : null
    }
  })

  return NextResponse.json(source, { status: 201 })
}
