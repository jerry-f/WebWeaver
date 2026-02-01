import { prisma } from '../prisma'
import { generateSummary } from './summarizer'
import { isAIEnabled } from './index'

let isProcessing = false

export async function queueArticleForSummary(articleId: string): Promise<void> {
  if (!isAIEnabled()) {
    return
  }

  await prisma.article.update({
    where: { id: articleId },
    data: { summaryStatus: 'pending' }
  })

  processQueueAsync()
}

export async function processQueueAsync(): Promise<void> {
  if (isProcessing || !isAIEnabled()) {
    return
  }

  isProcessing = true

  try {
    const pendingArticles = await prisma.article.findMany({
      where: { summaryStatus: 'pending' },
      take: 10,
      orderBy: { fetchedAt: 'desc' }
    })

    for (const article of pendingArticles) {
      await processArticle(article.id)
    }
  } catch (error) {
    console.error('Queue processing error:', error)
  } finally {
    isProcessing = false
  }
}

async function processArticle(articleId: string): Promise<void> {
  try {
    await prisma.article.update({
      where: { id: articleId },
      data: { summaryStatus: 'processing' }
    })

    const article = await prisma.article.findUnique({
      where: { id: articleId }
    })

    if (!article || !article.content) {
      await prisma.article.update({
        where: { id: articleId },
        data: { summaryStatus: 'failed' }
      })
      return
    }

    const result = await generateSummary(article.title, article.content)

    if (result) {
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
      await prisma.article.update({
        where: { id: articleId },
        data: { summaryStatus: 'failed' }
      })
    }
  } catch (error) {
    console.error(`Failed to process article ${articleId}:`, error)
    await prisma.article.update({
      where: { id: articleId },
      data: { summaryStatus: 'failed' }
    }).catch(() => {})
  }
}

export async function retryFailedSummaries(): Promise<number> {
  const failed = await prisma.article.updateMany({
    where: { summaryStatus: 'failed' },
    data: { summaryStatus: 'pending' }
  })

  if (failed.count > 0) {
    processQueueAsync()
  }

  return failed.count
}
