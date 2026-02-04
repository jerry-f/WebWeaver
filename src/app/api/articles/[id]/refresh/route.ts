import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchRSS } from '@/lib/fetchers/rss'
import { generateSummary } from '@/lib/ai/summarizer'
import { isAIEnabled } from '@/lib/ai'
import { getUnifiedFetcher, type UnifiedFetchOptions } from '@/lib/fetchers/unified-fetcher'
import type { FetchStrategy } from '@/lib/fetchers/types'

/**
 * 获取文章最新内容用于对比（不更新数据库）
 *
 * 从原始源重新抓取文章内容，生成新的 AI 摘要，返回新旧版本用于对比
 * 用户确认后才通过 /confirm 接口更新数据库
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

    // 方式2：使用 UnifiedFetcher 获取全文（根据 source 配置选择策略）
    // console.log('article:', article);
    if (article.url) {
      try {
        const fetcher = getUnifiedFetcher()

        // 根据 source 的 config 决定抓取策略
        const fetchOptions: UnifiedFetchOptions = {
          sourceId: article.sourceId || undefined
        }

        // 从 source.config.fetch.strategy 获取抓取策略
        if (article.source?.config) {
          try {
            const config = JSON.parse(article.source.config)
            if (config.fetch?.strategy) {
              fetchOptions.strategy = config.fetch.strategy as FetchStrategy
              console.log(`[refresh] 使用 source 配置的抓取策略: ${fetchOptions.strategy}`)
            }
          } catch {
            // config 解析失败，使用默认策略
          }
        }

        console.log(`[refresh] 使用 UnifiedFetcher 抓取: ${article.url}, 策略: ${fetchOptions.strategy || 'auto'}`)

        const result = await fetcher.fetch(article.url, fetchOptions)

        if (result.success && result.content) {
          newContent = result.content
          // 如果返回了标题，也可以更新
          if (result.title) {
            newTitle = result.title
          }
          console.log(`[refresh] 抓取成功，使用策略: ${result.strategy}`)
        } else {
          console.warn(`[refresh] 抓取失败: ${result.error}`)
        }
      } catch (e) {
        console.error('[refresh] UnifiedFetcher 全文抓取失败:', e)
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

    // 构建新版本数据（不更新数据库）
    const newVersion = {
      title: newTitle,
      content: newContent,
      summary: newSummary,
      tags: newTags,
      category: newCategory,
      imageUrl: newImageUrl,
      author: newAuthor,
      publishedAt: newPublishedAt,
    }

    // 返回新旧版本用于对比（不更新数据库）
    return NextResponse.json({
      success: true,
      oldVersion,
      newVersion,
    })
  } catch (error) {
    console.error('获取最新内容失败:', error)
    return NextResponse.json({
      error: '获取最新内容失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 })
  }
}
