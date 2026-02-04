import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * 确认更新文章内容
 *
 * 用户在对比视图中点击"确认更新"后调用此接口
 * 将新版本数据写入数据库
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // 获取请求体中的新版本数据
  const body = await req.json()
  const { newVersion } = body

  if (!newVersion) {
    return NextResponse.json({ error: '缺少新版本数据' }, { status: 400 })
  }

  // 检查文章是否存在
  const article = await prisma.article.findUnique({
    where: { id },
    select: { id: true }
  })

  if (!article) {
    return NextResponse.json({ error: '文章不存在' }, { status: 404 })
  }

  try {
    // 更新文章内容
    const updatedArticle = await prisma.article.update({
      where: { id },
      data: {
        title: newVersion.title,
        content: newVersion.content,
        imageUrl: newVersion.imageUrl,
        author: newVersion.author,
        publishedAt: newVersion.publishedAt ? new Date(newVersion.publishedAt) : null,
        summary: newVersion.summary,
        tags: newVersion.tags,
        category: newVersion.category,
        summaryStatus: newVersion.summary ? 'completed' : 'failed',
      },
      include: { source: { select: { name: true } } }
    })

    return NextResponse.json({
      success: true,
      article: updatedArticle,
    })
  } catch (error) {
    console.error('确认更新文章失败:', error)
    return NextResponse.json({
      error: '确认更新失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 })
  }
}
