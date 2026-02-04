import { NextRequest, NextResponse } from 'next/server'
import { fetchSource } from '@/lib/fetchers'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    // 解析请求体获取 force 参数
    let force = false
    try {
      const body = await req.json()
      force = body.force === true
    } catch {
      // 没有请求体，使用默认值
    }

    const result = await fetchSource(id, { force })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Fetch failed' },
      { status: 500 }
    )
  }
}
