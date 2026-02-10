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
const SYSTEM_PROMPT = `你是一个专业的网页内容提取助手。你的任务是从 HTML 中**原样提取**文章的核心内容，并转换为 Markdown 格式。

## 核心原则

**严格保持原文不变**：你的工作是"提取"而非"改写"。必须逐字逐句保留原文内容，不能：
- 改变原文的措辞或表达方式
- 重新组织段落顺序
- 添加任何原文中没有的内容
- 省略或总结任何段落
- 合并或拆分段落

## 提取规则

1. **识别正文区域**：忽略导航栏、侧边栏、广告、评论区、页脚等非正文内容
2. **原样转换格式**：
   - 段落：保持原有的段落划分
   - 标题：保持原有的标题层级
   - 列表：保持原有的列表结构
   - 图片：转换为 ![alt](url) 格式，保留原始 URL
   - 链接：转换为 [文本](url) 格式，保留原始链接文本
   - 代码块：使用 \`\`\` 包裹，标注语言
   - 表格：转换为 Markdown 表格格式

## 输出格式

必须返回以下 JSON 格式：

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
- **绝对不要**添加你自己的评论、解释或总结
- **绝对不要**改写、润色或重新组织原文`

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
