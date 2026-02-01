import OpenAI from 'openai'

let client: OpenAI | null = null

export function getAIClient(): OpenAI | null {
  if (!process.env.AI_SUMMARY_ENABLED || process.env.AI_SUMMARY_ENABLED !== 'true') {
    return null
  }

  if (!process.env.OPENAI_API_KEY) {
    return null
  }

  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    })
  }

  return client
}

export function getModel(): string {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini'
}

export function isAIEnabled(): boolean {
  return process.env.AI_SUMMARY_ENABLED === 'true' && !!process.env.OPENAI_API_KEY
}
