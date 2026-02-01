import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchFullText } from '@/lib/fetchers/fulltext'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const article = await prisma.article.findUnique({
    where: { id },
    include: { source: { select: { name: true } } }
  })
  
  if (!article) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  
  return NextResponse.json(article)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  
  // Only allow updating read/starred
  const { read, starred } = body
  const data: { read?: boolean; starred?: boolean } = {}
  if (typeof read === 'boolean') data.read = read
  if (typeof starred === 'boolean') data.starred = starred
  
  const article = await prisma.article.update({
    where: { id },
    data
  })
  
  return NextResponse.json(article)
}

// Fetch full content for an article
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const article = await prisma.article.findUnique({
    where: { id },
    select: { id: true, url: true, content: true }
  })
  
  if (!article) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  
  // Try to fetch full text
  const fullText = await fetchFullText(article.url)
  
  if (fullText && fullText.content.length > (article.content?.length || 0)) {
    const updated = await prisma.article.update({
      where: { id },
      data: { content: fullText.content },
      include: { source: { select: { name: true } } }
    })
    return NextResponse.json(updated)
  }
  
  // Return existing article if no better content found
  const existing = await prisma.article.findUnique({
    where: { id },
    include: { source: { select: { name: true } } }
  })
  return NextResponse.json(existing)
}
