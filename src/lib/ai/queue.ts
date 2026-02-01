import { prisma } from '../prisma'
import { generateSummary } from './summarizer'
import { isAIEnabled } from './index'

/**
 * AI 摘要队列处理模块
 *
 * 实现了一个简单的内存队列，用于异步处理文章的 AI 摘要生成
 *
 * 工作流程：
 * 1. 新文章入库时调用 queueArticleForSummary() 加入队列
 * 2. 后台异步处理队列中的文章
 * 3. 调用 AI 生成摘要、标签和分类
 * 4. 更新文章的 summaryStatus 状态
 *
 * 状态流转：
 * pending -> processing -> completed/failed
 */

/**
 * 队列处理锁
 *
 * 用于防止队列被并发处理
 * true 表示当前有任务正在处理中
 */
let isProcessing = false

/**
 * 将文章加入 AI 摘要生成队列
 *
 * 将文章的 summaryStatus 设为 'pending'，然后触发异步队列处理
 * 如果 AI 功能未启用，直接返回不做任何操作
 *
 * @param articleId - 文章 ID
 *
 * @example
 * // 在文章入库后调用
 * await queueArticleForSummary(newArticle.id)
 */
export async function queueArticleForSummary(articleId: string): Promise<void> {
  // AI 功能未启用时直接返回
  if (!isAIEnabled()) {
    return
  }

  // 将文章状态设为待处理
  await prisma.article.update({
    where: { id: articleId },
    data: { summaryStatus: 'pending' }
  })

  // 异步触发队列处理（不等待完成）
  processQueueAsync()
}

/**
 * 异步处理待生成摘要的文章队列
 *
 * 从数据库中获取待处理的文章，逐个生成 AI 摘要
 * 使用 isProcessing 锁防止并发处理
 *
 * 特点：
 * - 每次最多处理 10 篇文章
 * - 按抓取时间倒序处理（优先处理最新文章）
 * - 串行处理避免 API 速率限制
 */
export async function processQueueAsync(): Promise<void> {
  // 如果已有任务在处理中，或 AI 未启用，直接返回
  if (isProcessing || !isAIEnabled()) {
    return
  }

  // 加锁，防止并发处理
  isProcessing = true

  try {
    // 获取待处理的文章（最多 10 篇）
    const pendingArticles = await prisma.article.findMany({
      where: { summaryStatus: 'pending' },
      take: 10,
      orderBy: { fetchedAt: 'desc' }  // 优先处理最新文章
    })

    // 逐个处理文章
    for (const article of pendingArticles) {
      await processArticle(article.id)
    }
  } catch (error) {
    console.error('Queue processing error:', error)
  } finally {
    // 释放锁
    isProcessing = false
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
          summary: result.summary, // 文章摘要
          tags: JSON.stringify(result.tags),  // 标签数组序列化为 JSON
          category: result.category, // 文章分类
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
    }).catch(() => {})  // 忽略更新失败的错误
  }
}

/**
 * 重试所有失败的摘要生成任务
 *
 * 将所有 summaryStatus='failed' 的文章重置为 'pending'，
 * 然后重新触发队列处理
 *
 * @returns 重置的文章数量
 *
 * @example
 * // 在管理后台调用
 * const count = await retryFailedSummaries()
 * console.log(`已重置 ${count} 篇文章，即将重新生成摘要`)
 */
export async function retryFailedSummaries(): Promise<number> {
  // 批量更新所有失败的文章状态
  const failed = await prisma.article.updateMany({
    where: { summaryStatus: 'failed' },
    data: { summaryStatus: 'pending' }
  })

  // 如果有文章被重置，触发队列处理
  if (failed.count > 0) {
    processQueueAsync()
  }

  return failed.count
}
