import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchFullText } from '@/lib/fetchers/fulltext'
import { generateSummary } from '@/lib/ai/summarizer'
import { isAIEnabled } from '@/lib/ai'
import { addFetchJobs } from '@/lib/queue/queues'
import type { FetchStrategy } from '@/lib/fetchers/types'

/**
 * 批量操作文章
 *
 * 支持的操作：
 * - refresh: 批量刷新文章内容（重新抓取全文）
 * - forceRefresh: 强制抓取（使用配置的 strategy，通过队列系统）
 * - delete: 批量删除文章
 * - markRead: 批量标记为已读
 * - markUnread: 批量标记为未读
 * - star: 批量收藏
 * - unstar: 批量取消收藏
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, articleIds } = body as {
      action: 'refresh' | 'forceRefresh' | 'delete' | 'markRead' | 'markUnread' | 'star' | 'unstar'
      articleIds: string[]
    }

    if (!action || !articleIds || !Array.isArray(articleIds) || articleIds.length === 0) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 })
    }

    // 限制单次批量操作数量
    if (articleIds.length > 50) {
      return NextResponse.json({ error: '单次最多操作 50 篇文章' }, { status: 400 })
    }

    let result: { success: boolean; count: number; errors?: string[] }

    switch (action) {
      case 'delete':
        result = await batchDelete(articleIds)
        break
      case 'markRead':
        result = await batchUpdate(articleIds, { read: true })
        break
      case 'markUnread':
        result = await batchUpdate(articleIds, { read: false })
        break
      case 'star':
        result = await batchUpdate(articleIds, { starred: true })
        break
      case 'unstar':
        result = await batchUpdate(articleIds, { starred: false })
        break
      case 'refresh':
        result = await batchRefresh(articleIds)
        break
      case 'forceRefresh':
        result = await batchForceRefresh(articleIds)
        break
      default:
        return NextResponse.json({ error: '不支持的操作' }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('批量操作失败:', error)
    return NextResponse.json({
      error: '批量操作失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 })
  }
}

// 批量删除
async function batchDelete(articleIds: string[]) {
  const result = await prisma.article.deleteMany({
    where: { id: { in: articleIds } }
  })
  return { success: true, count: result.count }
}

// 批量更新
async function batchUpdate(articleIds: string[], data: { read?: boolean; starred?: boolean }) {
  const result = await prisma.article.updateMany({
    where: { id: { in: articleIds } },
    data
  })
  return { success: true, count: result.count }
}

// 批量刷新文章内容
async function batchRefresh(articleIds: string[]) {
  const articles = await prisma.article.findMany({
    where: { id: { in: articleIds } },
    include: { source: true }
  })

  const errors: string[] = []
  let successCount = 0

  // 逐个刷新文章
  for (const article of articles) {
    try {
      let newContent = article.content

      // 尝试抓取全文
      if (article.url) {
        const fullText = await fetchFullText(article.url)
        if (fullText && fullText.content && fullText.content.length > (newContent?.length || 0)) {
          newContent = fullText.content
        }
      }

      // 生成新的 AI 摘要
      let newSummary: string | null = null
      let newTags: string | null = null
      let newCategory: string | null = article.source?.category || null

      if (isAIEnabled() && newContent) {
        const summaryResult = await generateSummary(article.title, newContent)
        if (summaryResult) {
          newSummary = summaryResult.summary
          newTags = JSON.stringify(summaryResult.tags)
          newCategory = summaryResult.category
        }
      }

      // 更新文章
      await prisma.article.update({
        where: { id: article.id },
        data: {
          content: newContent,
          summary: newSummary,
          tags: newTags,
          category: newCategory,
          summaryStatus: newSummary ? 'completed' : 'failed',
        }
      })

      successCount++
    } catch (e) {
      console.error(`刷新文章 ${article.id} 失败:`, e)
      errors.push(`${article.title}: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  return {
    success: errors.length === 0,
    count: successCount,
    errors: errors.length > 0 ? errors : undefined
  }
}

// 强制抓取（通过队列系统，使用配置的 strategy）
async function batchForceRefresh(articleIds: string[]) {
  // 查询文章及其 source 配置
  const articles = await prisma.article.findMany({
    where: { id: { in: articleIds } },
    select: {
      id: true,
      url: true,
      sourceId: true,
      source: { select: { config: true } }
    }
  })

  if (articles.length === 0) {
    return { success: false, count: 0, errors: ['未找到文章'] }
  }

  // 按 sourceId 分组，获取各源的 strategy
  const sourceStrategyMap = new Map<string, FetchStrategy | undefined>()
  for (const article of articles) {
    if (!sourceStrategyMap.has(article.sourceId)) {
      const config = article.source?.config ? JSON.parse(article.source.config) : {}
      sourceStrategyMap.set(article.sourceId, config.fetch?.strategy)
    }
  }

  // 重置文章状态为 pending
  await prisma.article.updateMany({
    where: { id: { in: articleIds } },
    data: { contentStatus: 'pending' }
  })

  // 构建抓取任务
  const jobs = articles
    .filter(a => a.url)
    .map(a => ({
      articleId: a.id,
      url: a.url!,
      sourceId: a.sourceId,
      strategy: sourceStrategyMap.get(a.sourceId)
    }))

  if (jobs.length > 0) {
    await addFetchJobs(jobs, true)
  }

  return {
    success: true,
    count: jobs.length
  }
}
