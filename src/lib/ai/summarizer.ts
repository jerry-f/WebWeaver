import { getAIClient, getModel } from './index'

/**
 * AI 摘要生成结果
 *
 * 包含 AI 分析文章后生成的结构化数据
 */
export interface SummaryResult {
  /** AI 生成的文章摘要（100-200字） */
  summary: string
  /** AI 提取的相关标签（3-5个） */
  tags: string[]
  /** AI 判断的文章分类 */
  category: string
}

/**
 * AI 系统提示词
 *
 * 定义 AI 的角色和输出格式要求
 * 要求 AI 返回 JSON 格式，包含摘要、标签和分类
 */
const SYSTEM_PROMPT = `你是一个专业的新闻摘要助手。请根据提供的文章内容生成：
1. 一段简洁的中文摘要（100-200字）
2. 3-5个相关标签
3. 一个分类（如：科技、财经、体育、娱乐、政治、社会、健康、教育等）

请以JSON格式返回，格式如下：
{
  "summary": "摘要内容",
  "tags": ["标签1", "标签2", "标签3"],
  "category": "分类"
}`

/**
 * 使用 AI 生成文章摘要
 *
 * 调用 OpenAI API（或兼容服务）分析文章内容，生成：
 * - 中文摘要（100-200字）
 * - 相关标签（3-5个）
 * - 文章分类
 *
 * @param title - 文章标题
 * @param content - 文章内容（可能包含 HTML）
 * @returns 摘要结果对象，失败时返回 null
 *
 * @example
 * const result = await generateSummary('标题', '文章内容...')
 * if (result) {
 *   console.log(result.summary)   // "这篇文章讲述了..."
 *   console.log(result.tags)      // ["科技", "AI", "创新"]
 *   console.log(result.category)  // "科技"
 * }
 */
export async function generateSummary(title: string, content: string): Promise<SummaryResult | null> {
  // 获取 AI 客户端，未启用则直接返回
  const client = getAIClient()
  if (!client) {
    return null
  }

  // ========== 预处理文章内容 ==========
  // 移除 HTML 标签，只保留纯文本
  const text = content.replace(/<[^>]*>/g, '').trim()
  // 截断过长的内容（避免超出 token 限制）
  // 8000 字符大约对应 2000-4000 个 token
  const truncated = text.slice(0, 8000)

  try {
    // ========== 调用 AI API ==========
    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        // 系统消息：定义 AI 角色和输出格式
        { role: 'system', content: SYSTEM_PROMPT },
        // 用户消息：提供待分析的文章
        { role: 'user', content: `标题：${title}\n\n内容：${truncated}` }
      ],
      // 较低的 temperature 使输出更稳定、更确定性
      temperature: 0.3,
      // 限制输出长度，摘要不需要太长
      max_tokens: 2000,
    })

    // ========== 解析 AI 响应 ==========
    const resultText = response.choices[0]?.message?.content
    if (!resultText) {
      return null
    }

    // 从响应中提取 JSON 对象
    // AI 有时会在 JSON 前后添加额外文本，所以用正则匹配
    const jsonMatch = resultText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return null
    }

    // 解析 JSON 并确保字段类型正确
    const parsed = JSON.parse(jsonMatch[0]) as SummaryResult
    return {
      summary: parsed.summary || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      category: parsed.category || '',
    }
  } catch (error) {
    // API 调用失败或 JSON 解析失败
    console.error('AI summary generation failed:', error)
    return null
  }
}
