import OpenAI from 'openai'

/**
 * AI 模块入口文件
 *
 * 提供 OpenAI API 客户端的初始化和配置管理
 * 支持自定义 API 端点（兼容 OpenAI API 格式的服务，如 Azure OpenAI、本地部署的 LLM 等）
 */

/**
 * OpenAI 客户端单例
 * 使用单例模式避免重复创建客户端实例
 */
let client: OpenAI | null = null

/**
 * 获取 OpenAI API 客户端实例
 *
 * 采用懒加载单例模式：
 * - 首次调用时创建客户端实例
 * - 后续调用返回同一实例
 * - 如果 AI 功能未启用或缺少 API Key，返回 null
 *
 * @returns OpenAI 客户端实例，未启用时返回 null
 *
 * 环境变量配置：
 * - AI_SUMMARY_ENABLED: 是否启用 AI 摘要功能（需设为 'true'）
 * - OPENAI_API_KEY: OpenAI API 密钥（必填）
 * - OPENAI_BASE_URL: 自定义 API 端点（可选，用于兼容其他服务）
 */
export function getAIClient(): OpenAI | null {
  // 检查是否显式启用 AI 功能
  if (!process.env.AI_SUMMARY_ENABLED || process.env.AI_SUMMARY_ENABLED !== 'true') {
    return null
  }

  // 检查 API Key 是否配置
  if (!process.env.OPENAI_API_KEY) {
    return null
  }

  // 懒加载：仅在首次调用时创建客户端
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      // 支持自定义 API 端点，兼容 Azure OpenAI、本地 LLM 等
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    })
  }

  return client
}

/**
 * 获取使用的 AI 模型名称
 *
 * @returns 模型名称，默认使用 'gpt-4o-mini'（性价比较高的模型）
 *
 * 环境变量配置：
 * - OPENAI_MODEL: 指定使用的模型（可选）
 *   常用选项：'gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'
 */
export function getModel(): string {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini'
}

/**
 * 检查 AI 功能是否已启用
 *
 * 启用条件（两者都必须满足）：
 * 1. AI_SUMMARY_ENABLED 环境变量设为 'true'
 * 2. OPENAI_API_KEY 环境变量已配置
 *
 * @returns 是否启用 AI 功能
 */
export function isAIEnabled(): boolean {
  return process.env.AI_SUMMARY_ENABLED === 'true' && !!process.env.OPENAI_API_KEY
}
