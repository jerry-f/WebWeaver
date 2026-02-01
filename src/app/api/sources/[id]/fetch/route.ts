import { NextRequest, NextResponse } from 'next/server'
import { fetchSource } from '@/lib/fetchers'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const result = await fetchSource(id)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Fetch failed' },
      { status: 500 }
    )
  }
}
