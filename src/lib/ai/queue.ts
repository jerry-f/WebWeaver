import { prisma } from '../prisma'
import { generateSummary } from './summarizer'
import { isAIEnabled } from './index'

/**
 * AI 摘要队列处理模块
 *
 * 实现按需处理单篇文章的 AI 摘要生成
 *
 * 工作流程：
 * 1. 新文章入库时调用 queueArticleForSummary(articleId)
 * 2. 直接异步处理该篇文章（不阻塞主流程）
 * 3. 调用 AI 生成摘要、标签和分类
 * 4. 更新文章的 summaryStatus 状态
 *
 * 状态流转：
 * pending -> processing -> completed/failed
 */

/**
 * 将文章加入 AI 摘要生成队列并立即处理
 *
 * 将文章的 summaryStatus 设为 'pending'，然后异步处理该文章
 * 如果 AI 功能未启用，直接返回不做任何操作
 *
 * @param articleId - 文章 ID
 *
 * @example
 * // 在文章入库后调用
 * queueArticleForSummary(newArticle.id)
 */
export function queueArticleForSummary(articleId: string): void {
  // AI 功能未启用时直接返回
  if (!isAIEnabled()) {
    return
  }

  // 异步处理该文章（不等待完成，不阻塞主流程）
  processArticleAsync(articleId)
}

/**
 * 异步处理单篇文章的 AI 摘要生成
 *
 * 包装 processArticle 为不抛出异常的异步调用
 *
 * @param articleId - 文章 ID
 */
async function processArticleAsync(articleId: string): Promise<void> {
  try {
    await processArticle(articleId)
  } catch (error) {
    console.error(`Failed to process article ${articleId}:`, error)
  }
}

/**
 * 处理单篇文章的 AI 摘要生成
 *
 * 状态流转：pending -> processing -> completed/failed
 *
 * @param articleId - 文章 ID
 */
async function processArticle(articleId: string): Promise<void> {
  try {
    // ========== 标记为处理中 ==========
    await prisma.article.update({
      where: { id: articleId },
      data: { summaryStatus: 'processing' }
    })

    // ========== 获取文章内容 ==========
    const article = await prisma.article.findUnique({
      where: { id: articleId }
    })

    // 文章不存在或没有内容，标记为失败
    if (!article || !article.content) {
      await prisma.article.update({
        where: { id: articleId },
        data: { summaryStatus: 'failed' }
      })
      return
    }

    // ========== 调用 AI 生成摘要 ==========
    const result = await generateSummary(article.title, article.content)

    // ========== 更新文章数据 ==========
    if (result) {
      // 生成成功，保存摘要、标签和分类
      await prisma.article.update({
        where: { id: articleId },
        data: {
          summary: result.summary,
          tags: JSON.stringify(result.tags),
          category: result.category,
          summaryStatus: 'completed'
        }
      })
    } else {
      // 生成失败
      await prisma.article.update({
        where: { id: articleId },
        data: { summaryStatus: 'failed' }
      })
    }
  } catch (error) {
    // 处理过程中出错，标记为失败
    console.error(`Failed to process article ${articleId}:`, error)
    await prisma.article.update({
      where: { id: articleId },
      data: { summaryStatus: 'failed' }
    }).catch(() => {})
  }
}

/**
 * 批量处理所有待处理的文章
 *
 * 用于手动触发或定时任务，处理所有 pending 状态的文章
 *
 * @param limit - 最多处理的文章数量，默认 10
 * @returns 处理的文章数量
 */
export async function processPendingArticles(limit: number = 10): Promise<number> {
  if (!isAIEnabled()) {
    return 0
  }

  const pendingArticles = await prisma.article.findMany({
    where: { summaryStatus: 'pending' },
    take: limit,
    orderBy: { fetchedAt: 'desc' },
    select: { id: true }
  })

  // 逐个处理（串行，避免 API 速率限制）
  for (const article of pendingArticles) {
    await processArticle(article.id)
  }

  return pendingArticles.length
}

/**
 * 重试所有失败的摘要生成任务
 *
 * 将所有 summaryStatus='failed' 的文章重新处理
 *
 * @param limit - 最多处理的文章数量，默认 10
 * @returns 处理的文章数量
 */
export async function retryFailedSummaries(limit: number = 10): Promise<number> {
  if (!isAIEnabled()) {
    return 0
  }

  const failedArticles = await prisma.article.findMany({
    where: { summaryStatus: 'failed' },
    take: limit,
    orderBy: { fetchedAt: 'desc' },
    select: { id: true }
  })

  // 逐个处理
  for (const article of failedArticles) {
    await processArticle(article.id)
  }

  return failedArticles.length
}
