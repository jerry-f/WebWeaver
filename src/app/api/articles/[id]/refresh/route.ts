import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchRSS } from '@/lib/fetchers/rss'
import { generateSummary } from '@/lib/ai/summarizer'
import { isAIEnabled } from '@/lib/ai'
import { getScraperClient } from '@/lib/fetchers/clients/scraper-adapter'

/**
 * 刷新单篇文章内容
 *
 * 从原始源重新抓取文章内容，生成新的 AI 摘要，返回新旧版本用于对比
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // 获取原文章
  const article = await prisma.article.findUnique({
    where: { id },
    include: { source: true }
  })

  if (!article) {
    return NextResponse.json({ error: '文章不存在' }, { status: 404 })
  }

  // 保存旧版本用于对比
  const oldVersion = {
    title: article.title,
    content: article.content,
    summary: article.summary,
    tags: article.tags,
    category: article.category,
    imageUrl: article.imageUrl,
    author: article.author,
    publishedAt: article.publishedAt,
  }

  try {
    let newContent = article.content
    let newTitle = article.title
    let newImageUrl = article.imageUrl
    let newAuthor = article.author
    let newPublishedAt = article.publishedAt

    // 方式1：尝试从 RSS 源重新获取该文章
    if (article.source && article.source.type.toLowerCase() === 'rss') {
      try {
        const articles = await fetchRSS(article.source.url)
        const matchedArticle = articles.find(a =>
          a.url === article.url || a.externalId === article.externalId
        )
        if (matchedArticle) {
          newTitle = matchedArticle.title || newTitle
          newContent = matchedArticle.content || newContent
          newImageUrl = matchedArticle.imageUrl || newImageUrl
          newAuthor = matchedArticle.author || newAuthor
          newPublishedAt = matchedArticle.publishedAt || newPublishedAt
        }
      } catch (e) {
        console.error('RSS 重新抓取失败:', e)
      }
    }

    // 方式2：尝试通过 Go 抓取服务获取全文
    if (article.url) {
      try {
        const scraperClient = getScraperClient()
        const isAvailable = await scraperClient.isAvailable()

        if (isAvailable) {
          const fullText = await scraperClient.fetch({ url: article.url })
          if (fullText && fullText.content) {
            newContent = fullText.content || ''
            // 如果 Go 服务返回了标题，也可以更新
            if (fullText.title && !newTitle) {
            newTitle = fullText.title
            }
          }
        } else {
          console.warn('[refresh] Go 抓取服务不可用，跳过全文抓取')
        }
      } catch (e) {
        console.error('[refresh] Go 抓取服务全文抓取失败:', e)
      }
    }

    // 生成新的 AI 摘要（同步等待完成）
    let newSummary: string | null = null
    let newTags: string | null = null
    let newCategory: string | null = article.source?.category || null

    if (isAIEnabled() && newContent) {
      const summaryResult = await generateSummary(newTitle, newContent)
      if (summaryResult) {
        newSummary = summaryResult.summary
        newTags = JSON.stringify(summaryResult.tags)
        newCategory = summaryResult.category
      }
    }

    // 更新文章内容
    const updatedArticle = await prisma.article.update({
      where: { id },
      data: {
        title: newTitle,
        content: newContent,
        imageUrl: newImageUrl,
        author: newAuthor,
        publishedAt: newPublishedAt,
        summary: newSummary,
        tags: newTags,
        category: newCategory,
        summaryStatus: newSummary ? 'completed' : 'failed',
      },
      include: { source: { select: { name: true } } }
    })

    // 返回新旧版本用于对比
    return NextResponse.json({
      success: true,
      oldVersion,
      newVersion: {
        title: updatedArticle.title,
        content: updatedArticle.content,
        summary: updatedArticle.summary,
        tags: updatedArticle.tags,
        category: updatedArticle.category,
        imageUrl: updatedArticle.imageUrl,
        author: updatedArticle.author,
        publishedAt: updatedArticle.publishedAt,
      },
      article: updatedArticle,
    })
  } catch (error) {
    console.error('刷新文章失败:', error)
    return NextResponse.json({
      error: '刷新文章失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 })
  }
}
