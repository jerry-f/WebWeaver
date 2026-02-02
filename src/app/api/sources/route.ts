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
  const { 
    name, 
    type, 
    url, 
    category, 
    fetchFullText,
    config 
  } = body

  // 验证必填字段
  if (!name || !url) {
    return NextResponse.json(
      { error: 'Missing required fields: name, url' }, 
      { status: 400 }
    )
  }

  // 支持两种方式：直接传 type，或通过 URL 自动检测（默认 rss）
  const sourceType = type || 'rss'

  // 验证 Scrape 类型必须有选择器配置
  if (sourceType === 'scrape') {
    if (!config?.scrape?.listSelector || !config?.scrape?.titleSelector || !config?.scrape?.linkSelector) {
      return NextResponse.json(
        { error: 'Scrape type requires listSelector, titleSelector, and linkSelector' },
        { status: 400 }
      )
    }
  }

  try {
    const source = await prisma.source.create({
      data: {
        name,
        type: sourceType,
        url,
        category: category || null,
        fetchFullText: fetchFullText ?? false,
        config: config ? JSON.stringify(config) : null
      }
    })

    return NextResponse.json(source, { status: 201 })
  } catch (error) {
    console.error('Failed to create source:', error)
    return NextResponse.json(
      { error: 'Failed to create source' },
      { status: 500 }
    )
  }
}
