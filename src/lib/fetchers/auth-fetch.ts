/**
 * 认证抓取服务
 *
 * 支持 Cookie 注入的抓取功能
 */

import { prisma } from '../prisma'
import { decryptCredential } from '../auth/credential-crypto'

/**
 * 认证抓取选项
 */
export interface AuthFetchOptions {
  /** 超时时间（毫秒） */
  timeout?: number
  /** 额外请求头 */
  headers?: Record<string, string>
}

/**
 * 认证抓取结果
 */
export interface AuthFetchResult {
  /** 响应对象 */
  response: Response
  /** 是否使用了认证 */
  authenticated: boolean
  /** 凭证是否过期 */
  credentialExpired: boolean
}

/**
 * 默认 User-Agent
 */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * 带认证的抓取
 *
 * 自动注入源关联的 Cookie 凭证
 *
 * @param sourceId - 信息源 ID
 * @param url - 抓取 URL
 * @param options - 抓取选项
 * @returns 抓取结果
 */
export async function fetchWithAuth(
  sourceId: string,
  url: string,
  options: AuthFetchOptions = {}
): Promise<AuthFetchResult> {
  // 获取源配置和关联凭证
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { credential: true }
  })

  const headers: Record<string, string> = {
    'User-Agent': DEFAULT_USER_AGENT,
    ...options.headers
  }

  let authenticated = false
  let credentialExpired = false

  // 如果有认证凭证，注入 Cookie
  if (source?.credential?.encryptedCookie) {
    try {
      const cookie = decryptCredential(source.credential.encryptedCookie)
      headers['Cookie'] = cookie
      authenticated = true

      // 更新最后使用时间
      await prisma.siteCredential.update({
        where: { id: source.credential.id },
        data: { lastUsedAt: new Date() }
      })
    } catch (error) {
      console.error('[AuthFetch] 解密 Cookie 失败:', error)
    }
  }

  // 执行抓取
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeout || 15000
  )

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal
    })

    // 检测认证失败，标记凭证过期
    if (authenticated && (response.status === 401 || response.status === 403)) {
      credentialExpired = true

      if (source?.credential) {
        await prisma.siteCredential.update({
          where: { id: source.credential.id },
          data: {
            status: 'expired',
            errorMessage: `认证失败: HTTP ${response.status}`
          }
        })
        console.warn(`[AuthFetch] 凭证已过期: ${source.credential.domain}`)
      }
    }

    return {
      response,
      authenticated,
      credentialExpired
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 根据域名获取 Cookie
 *
 * @param domain - 域名
 * @param userId - 用户 ID（可选，不提供则使用任意可用凭证）
 * @returns Cookie 字符串或 null
 */
export async function getCookieForDomain(
  domain: string,
  userId?: string
): Promise<string | null> {
  const credential = await prisma.siteCredential.findFirst({
    where: {
      domain,
      status: 'active',
      ...(userId ? { userId } : {})
    }
  })

  if (!credential?.encryptedCookie) {
    return null
  }

  try {
    return decryptCredential(credential.encryptedCookie)
  } catch {
    return null
  }
}

/**
 * 从 URL 提取域名
 *
 * @param url - URL
 * @returns 域名
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
