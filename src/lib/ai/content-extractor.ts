/**
 * AI 内容提取器
 *
 * 使用 AI 从 HTML 中提取核心内容并转换为 Markdown
 */

import { getAIClient, getModel } from './index'

/**
 * AI 提取结果
 */
export interface AIExtractionResult {
  /** Markdown 格式的正文内容 */
  markdown: string
  /** 提取的标题 */
  title?: string
  /** 提取的作者 */
  author?: string
  /** 提取的发布时间 */
  publishedAt?: string
  /** 提取的摘要 */
  excerpt?: string
  /** Token 使用量 */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * System Prompt
 *
 * 设计原则：
 * 1. 明确角色和任务
 * 2. 强调输出格式一致性
 * 3. 给出具体的 Markdown 格式要求
 */
const SYSTEM_PROMPT = `你是一个专业的网页内容提取助手。你的任务是从 HTML 中提取文章的核心内容，并转换为干净的 Markdown 格式。

## 提取规则

1. **只提取正文内容**：忽略导航、广告、评论、推荐阅读、页脚等无关内容
2. **保留文章结构**：标题层级、段落、列表、引用块等
3. **保留重要元素**：
   - 图片：转换为 ![alt](url) 格式，保留原始 URL
   - 链接：转换为 [文本](url) 格式
   - 代码块：使用 \`\`\` 包裹，标注语言
   - 表格：转换为 Markdown 表格格式
4. **清理格式**：
   - 移除多余的空行（最多保留一个空行）
   - 移除装饰性内容（分隔线仅在必要时保留）

## 输出格式

必须返回以下 JSON 格式（不要包含 markdown 代码块标记）：

{
  "title": "文章标题",
  "author": "作者名（如果能识别，否则为 null）",
  "publishedAt": "发布时间（ISO 8601 格式，如果能识别，否则为 null）",
  "excerpt": "一句话摘要（50字以内）",
  "markdown": "完整的 Markdown 正文内容"
}

## 注意事项

- 如果无法识别某个字段，设为 null
- markdown 字段中的换行使用 \\n 转义
- 不要添加你自己的评论或解释
- 保持原文内容的完整性，不要总结或缩写`

/**
 * 使用 AI 从 HTML 提取内容
 *
 * @param html - 预处理后的 HTML
 * @param url - 原始 URL
 * @param options - 可选配置
 * @returns AI 提取结果，失败时返回 null
 */
export async function extractContentWithAI(
  html: string,
  url: string,
  options: {
    timeout?: number
  } = {}
): Promise<AIExtractionResult | null> {
  const client = getAIClient()
  if (!client) {
    console.warn('[AI Extractor] AI 未启用')
    return null
  }

  try {
    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `请从以下 HTML 中提取文章内容：

URL: ${url}

HTML 内容：
${html}`
        }
      ],
      temperature: 0.1, // 极低温度，确保输出稳定
      max_tokens: 8000, // 足够容纳大多数文章
      response_format: { type: 'json_object' } // 强制 JSON 输出
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      console.error('[AI Extractor] AI 返回空内容')
      return null
    }

    // 解析 JSON 响应
    const parsed = JSON.parse(content)

    // 记录使用量
    if (response.usage) {
      console.log(
        `[AI Extractor] Token 使用: ${response.usage.total_tokens} (prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens})`
      )
    }

    return {
      markdown: parsed.markdown || '',
      title: parsed.title || undefined,
      author: parsed.author || undefined,
      publishedAt: parsed.publishedAt || undefined,
      excerpt: parsed.excerpt || undefined,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens
          }
        : undefined
    }
  } catch (error) {
    console.error('[AI Extractor] 提取失败:', error)
    return null
  }
}
