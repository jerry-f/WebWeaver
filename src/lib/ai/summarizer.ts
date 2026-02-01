import { getAIClient, getModel } from './index'

export interface SummaryResult {
  summary: string
  tags: string[]
  category: string
}

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

export async function generateSummary(title: string, content: string): Promise<SummaryResult | null> {
  const client = getAIClient()
  if (!client) {
    return null
  }

  const text = content.replace(/<[^>]*>/g, '').trim()
  const truncated = text.slice(0, 8000)

  try {
    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `标题：${title}\n\n内容：${truncated}` }
      ],
      temperature: 0.3,
      max_tokens: 500,
    })

    const resultText = response.choices[0]?.message?.content
    if (!resultText) {
      return null
    }

    const jsonMatch = resultText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return null
    }

    const parsed = JSON.parse(jsonMatch[0]) as SummaryResult
    return {
      summary: parsed.summary || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      category: parsed.category || '',
    }
  } catch (error) {
    console.error('AI summary generation failed:', error)
    return null
  }
}
