import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const source = await prisma.source.findUnique({
    where: { id },
    include: { _count: { select: { articles: true } } }
  })
  
  if (!source) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  
  return NextResponse.json(source)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  
  const source = await prisma.source.update({
    where: { id },
    data: body
  })
  
  return NextResponse.json(source)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await prisma.source.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
