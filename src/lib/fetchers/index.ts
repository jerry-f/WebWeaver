import { prisma } from '../prisma'
import { fetchRSS } from './rss'
import { fetchFullText } from './fulltext'
import { fetchScrape } from './scrape'
import { FetchedArticle, SourceConfig } from './types'
import { calculateReadingTime } from '../utils/reading-time'
import { queueArticleForSummary } from '../ai/queue'

/**
 * 抓取单个信息源的文章
 *
 * 这是文章抓取的核心函数，负责：
 * 1. 根据信息源类型（RSS/Scrape）获取文章列表
 * 2. 可选地抓取文章全文内容
 * 3. 计算阅读时间
 * 4. 将文章存入数据库（自动去重）
 * 5. 将新文章加入 AI 摘要生成队列
 *
 * @param sourceId - 信息源的唯一标识符
 * @returns 返回新增文章数量和错误信息列表
 */
export async function fetchSource(sourceId: string): Promise<{ added: number; errors: string[] }> {
  // ========== 第一步：获取信息源配置 ==========
  // 从数据库查询信息源的详细配置（URL、类型、是否启用全文抓取等）
  const source = await prisma.source.findUnique({ where: { id: sourceId } })
  if (!source) throw new Error('Source not found')

  // 存储抓取到的文章列表
  let articles: FetchedArticle[] = []
  // 存储抓取过程中的错误信息
  const errors: string[] = []

  // ========== 第二步：根据类型抓取文章列表 ==========
  try {
    // 解析信息源的额外配置（如 Scrape 类型需要的 CSS 选择器等）
    const config: SourceConfig = source.config ? JSON.parse(source.config) : {}

    // 根据信息源类型分发到对应的抓取器
    switch (source.type.toLowerCase()) {
      case 'rss':
        // RSS 类型：使用 rss-parser 库解析 RSS/Atom 订阅源
        // 返回的文章包含：标题、链接、摘要、发布时间、作者、封面图等
        articles = await fetchRSS(source.url)
        break

      case 'scrape':
        // Scrape 类型：使用自定义选择器抓取网页
        // 需要在 config.scrape 中配置 CSS 选择器规则
        if (!config.scrape) {
          throw new Error('Scrape config is required for scrape type sources')
        }
        articles = await fetchScrape(source.url, config.scrape)
        break

      default:
        // 未知类型，抛出错误
        throw new Error(`Unknown source type: ${source.type}`)
    }
  } catch (e) {
    // 抓取失败时记录错误并返回
    errors.push(e instanceof Error ? e.message : String(e))
    return { added: 0, errors }
  }

  // ========== 第三步：处理每篇文章并存入数据库 ==========
  let added = 0 // 记录成功新增的文章数量

  for (const article of articles) {
    try {
      let content = article.content
      let textContent: string | undefined  // 新增：纯文本内容
      let readingTime: number | undefined

      // ---------- 3.1 全文抓取（可选） ----------
      // 如果信息源启用了 fetchFullText 选项，则访问文章原始 URL 获取完整正文
      // 使用 @mozilla/readability 库提取正文，过滤掉广告和导航等干扰内容
      if (source.fetchFullText && article.url) {
        const fullText = await fetchFullText(article.url)
        if (fullText?.content) {
          content = fullText.content          // HTML 格式（用于展示）
          textContent = fullText.textContent  // 纯文本（用于 AI/搜索）
        }
      }

      // ---------- 3.2 计算阅读时间 ----------
      // 根据文章内容长度估算阅读所需分钟数
      // 优先使用纯文本计算，更准确
      const textForReading = textContent || content
      if (textForReading) {
        readingTime = calculateReadingTime(textForReading)
      }

      // ---------- 3.3 存入数据库（Upsert 去重） ----------
      // 使用 upsert 操作：
      // - 如果文章已存在（通过 sourceId + externalId 判断），则跳过不更新
      // - 如果是新文章，则创建新记录
      // 这样可以防止重复抓取同一篇文章
      const result = await prisma.article.upsert({
        where: {
          // 复合唯一索引：同一信息源下的 externalId 必须唯一
          // externalId 通常是 RSS 中的 guid 或文章 URL
          sourceId_externalId: {
            sourceId: source.id,
            externalId: article.externalId
          }
        },
        create: {
          // 新文章的所有字段
          sourceId: source.id,           // 关联的信息源 ID
          externalId: article.externalId, // 外部唯一标识（用于去重）
          title: article.title,           // 文章标题
          content,                        // HTML 格式内容（用于展示）
          textContent,                    // 纯文本内容（用于 AI/搜索）
          url: article.url,               // 文章原始链接
          imageUrl: article.imageUrl,     // 封面图 URL
          author: article.author,         // 作者
          publishedAt: article.publishedAt, // 发布时间
          readingTime,                    // 预计阅读时间（分钟）
          category: source?.category || null,      // 从信息源继承分类
          summaryStatus: 'pending',       // AI 摘要状态：待生成
          contentStatus: content ? 'completed' : 'pending',  // 内容抓取状态
          fetchStrategy: source.fetchFullText ? 'fetch' : undefined  // 抓取策略
        },
        update: {} // 已存在的文章不做任何更新
      })

      // ---------- 3.4 加入 AI 摘要队列 ----------
      // 新文章成功入库后，将其加入 AI 摘要生成队列
      // 后台任务会异步处理这些文章，生成智能摘要
      if (result) {
        queueArticleForSummary(result.id)
      }

      added++
    } catch {
      // 捕获异常但不中断循环
      // 通常是因为违反唯一约束（文章已存在），直接跳过即可
    }
  }

  // 返回本次抓取的结果统计
  return { added, errors }
}

/**
 * 抓取所有已启用的信息源
 *
 * 遍历数据库中所有 enabled=true 的信息源，依次调用 fetchSource 进行抓取
 * 适用于定时任务批量更新所有订阅源
 *
 * @returns 返回每个信息源的抓取结果数组
 */
export async function fetchAllSources(): Promise<{ sourceId: string; added: number; errors: string[] }[]> {
  // 查询所有启用的信息源
  const sources = await prisma.source.findMany({ where: { enabled: true } })
  const results = []

  // 依次抓取每个信息源（串行执行，避免并发过高）
  for (const source of sources) {
    const result = await fetchSource(source.id)
    results.push({ sourceId: source.id, ...result })
  }

  return results
}
