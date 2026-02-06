/**
 * HTML 预处理器（轻量版）
 *
 * 在发送给 AI 之前对 HTML 进行最小化处理
 * 保留完整结构以帮助 AI 理解页面语义
 */

import { JSDOM } from 'jsdom'

/**
 * 预处理配置
 */
export interface PreprocessOptions {
  /** 基础 URL（用于相对路径解析） */
  baseUrl?: string
}

/**
 * 预处理结果
 */
export interface PreprocessResult {
  /** 处理后的 HTML */
  html: string
  /** 原始 HTML 长度 */
  originalLength: number
  /** 处理后 HTML 长度 */
  processedLength: number
}

/**
 * 预处理 HTML
 *
 * 仅移除 script 标签，保留其他所有内容：
 * - 保留 class、id 等属性（帮助 AI 理解语义）
 * - 保留 nav、header、footer（让 AI 自己判断正文范围）
 * - 保留 HTML 注释（可能包含有用信息）
 * - 不做截断（让 AI 处理完整内容）
 *
 * @param html - 原始 HTML
 * @param options - 预处理选项
 * @returns 预处理结果
 */
export function preprocessHtml(
  html: string,
  options: PreprocessOptions = {}
): PreprocessResult {
  const originalLength = html.length

  // 使用 JSDOM 解析
  const dom = new JSDOM(html, { url: options.baseUrl })
  const document = dom.window.document

  // 仅移除 script 标签（包含内容）
  document.querySelectorAll('script').forEach(el => el.remove())

  // 获取处理后的 HTML
  const processedHtml = document.documentElement.outerHTML

  return {
    html: processedHtml,
    originalLength,
    processedLength: processedHtml.length
  }
}

/**
 * 估算文本的 token 数量
 *
 * 粗略估算：
 * - 中文约 1 字符 = 0.5-1 token
 * - 英文约 4 字符 = 1 token
 *
 * @param text - 要估算的文本
 * @returns 估算的 token 数量
 */
export function estimateTokens(text: string): number {
  // 检测中文字符数量
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const totalChars = text.length

  // 混合估算
  const chineseTokens = chineseChars * 0.7
  const otherTokens = (totalChars - chineseChars) / 4

  return Math.ceil(chineseTokens + otherTokens)
}
