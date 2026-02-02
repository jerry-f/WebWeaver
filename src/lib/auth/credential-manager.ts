/**
 * 站点凭证管理器
 * 
 * 从配置文件加载站点 Cookie，支持：
 * - 文件存储的 Cookie
 * - 域名匹配
 * - 过期检测
 */

import * as fs from 'fs'
import * as path from 'path'

interface SiteCredentialConfig {
  enabled: boolean
  authType: 'cookie' | 'login' | 'token'
  cookieFile?: string
  cookie?: string  // 直接内联 Cookie（不推荐）
  domains: string[]
  note?: string
  expiresAt?: string | null
  lastUpdated?: string
}

interface CredentialsConfig {
  credentials: Record<string, SiteCredentialConfig>
}

/**
 * 凭证管理器
 */
export class CredentialManager {
  private config: CredentialsConfig
  private configPath: string
  private cookieCache: Map<string, string> = new Map()

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), 'config/site-credentials.json')
    this.config = this.loadConfig()
  }

  /**
   * 加载配置文件
   */
  private loadConfig(): CredentialsConfig {
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      console.warn(`[CredentialManager] 无法加载配置: ${this.configPath}`)
      return { credentials: {} }
    }
  }

  /**
   * 重新加载配置
   */
  reload(): void {
    this.config = this.loadConfig()
    this.cookieCache.clear()
  }

  /**
   * 根据 URL 获取 Cookie
   * 
   * @param url - 目标 URL
   * @returns Cookie 字符串或 null
   */
  getCookieForUrl(url: string): string | null {
    const domain = this.extractDomain(url)
    return this.getCookieForDomain(domain)
  }

  /**
   * 根据域名获取 Cookie
   * 
   * @param domain - 域名
   * @returns Cookie 字符串或 null
   */
  getCookieForDomain(domain: string): string | null {
    // 检查缓存
    if (this.cookieCache.has(domain)) {
      return this.cookieCache.get(domain) || null
    }

    // 查找匹配的凭证配置
    const credConfig = this.findCredentialConfig(domain)
    if (!credConfig || !credConfig.enabled) {
      return null
    }

    // 加载 Cookie
    const cookie = this.loadCookie(credConfig)
    if (cookie) {
      this.cookieCache.set(domain, cookie)
    }
    return cookie
  }

  /**
   * 检查域名是否需要认证
   */
  requiresAuth(url: string): boolean {
    const domain = this.extractDomain(url)
    const config = this.findCredentialConfig(domain)
    return config?.enabled === true
  }

  /**
   * 获取所有需要认证的域名
   */
  getAuthenticatedDomains(): string[] {
    const domains: string[] = []
    for (const [key, config] of Object.entries(this.config.credentials)) {
      if (config.enabled) {
        domains.push(key, ...config.domains)
      }
    }
    return [...new Set(domains)]
  }

  /**
   * 查找域名对应的凭证配置
   */
  private findCredentialConfig(domain: string): SiteCredentialConfig | null {
    // 精确匹配
    if (this.config.credentials[domain]) {
      return this.config.credentials[domain]
    }

    // 移除 www. 后匹配
    const mainDomain = domain.replace(/^www\./, '')
    if (this.config.credentials[mainDomain]) {
      return this.config.credentials[mainDomain]
    }

    // 检查 domains 数组
    for (const [, config] of Object.entries(this.config.credentials)) {
      for (const d of config.domains) {
        // 支持通配符匹配 *.example.com
        if (d.startsWith('*.')) {
          const baseDomain = d.slice(2)
          if (domain.endsWith(baseDomain) || domain === baseDomain) {
            return config
          }
        } else if (d === domain || d === mainDomain) {
          return config
        }
      }
    }

    return null
  }

  /**
   * 加载 Cookie
   */
  private loadCookie(config: SiteCredentialConfig): string | null {
    // 直接内联的 Cookie
    if (config.cookie) {
      return config.cookie
    }

    // 从文件加载
    if (config.cookieFile) {
      const cookiePath = path.join(path.dirname(this.configPath), config.cookieFile)
      try {
        return fs.readFileSync(cookiePath, 'utf-8').trim()
      } catch (error) {
        console.warn(`[CredentialManager] 无法读取 Cookie 文件: ${cookiePath}`)
        return null
      }
    }

    return null
  }

  /**
   * 从 URL 提取域名
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch {
      return ''
    }
  }
}

// 单例
let _instance: CredentialManager | null = null

/**
 * 获取凭证管理器单例
 */
export function getCredentialManager(): CredentialManager {
  if (!_instance) {
    _instance = new CredentialManager()
  }
  return _instance
}

/**
 * 根据 URL 获取 Cookie（快捷方法）
 */
export function getCookieForUrl(url: string): string | null {
  return getCredentialManager().getCookieForUrl(url)
}

/**
 * 检查 URL 是否需要认证
 */
export function requiresAuth(url: string): boolean {
  return getCredentialManager().requiresAuth(url)
}
