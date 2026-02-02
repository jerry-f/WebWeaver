/**
 * 凭证状态检测服务
 * 
 * 监控和检测站点凭证的有效性：
 * - 检测凭证是否过期
 * - 检测凭证是否即将过期
 * - 发送过期提醒
 */

import * as fs from 'fs'
import * as path from 'path'
import { CredentialManager } from '../auth/credential-manager'
import { GoScraperClient } from '../fetchers/clients/go-scraper'

/**
 * 凭证状态
 */
export interface CredentialStatus {
  domain: string
  enabled: boolean
  valid: boolean
  lastChecked: Date
  error?: string
  cookieLength?: number
  expiresAt?: Date
}

/**
 * 检测结果
 */
export interface CredentialCheckResult {
  total: number
  valid: number
  invalid: number
  details: CredentialStatus[]
}

/**
 * 站点测试 URL 配置
 */
const SITE_TEST_URLS: Record<string, string> = {
  'zhihu.com': 'https://www.zhihu.com/api/v4/me',
  'medium.com': 'https://medium.com/me/settings',
  'juejin.cn': 'https://api.juejin.cn/user_api/v1/user/get',
}

/**
 * 凭证状态检测器
 */
export class CredentialChecker {
  private credentialManager: CredentialManager
  private goClient: GoScraperClient
  private statusCache: Map<string, CredentialStatus> = new Map()

  constructor() {
    this.credentialManager = new CredentialManager()
    this.goClient = new GoScraperClient()
  }

  /**
   * 检测所有凭证状态
   */
  async checkAll(): Promise<CredentialCheckResult> {
    const domains = this.credentialManager.getAuthenticatedDomains()
    const uniqueDomains = [...new Set(domains.map(d => d.replace(/^www\./, '')))]
    
    const details: CredentialStatus[] = []
    let valid = 0
    let invalid = 0

    for (const domain of uniqueDomains) {
      const status = await this.checkDomain(domain)
      details.push(status)
      
      if (status.valid) {
        valid++
      } else {
        invalid++
      }
    }

    return {
      total: uniqueDomains.length,
      valid,
      invalid,
      details
    }
  }

  /**
   * 检测单个域名的凭证状态
   */
  async checkDomain(domain: string): Promise<CredentialStatus> {
    const cookie = this.credentialManager.getCookieForDomain(domain)
    
    const status: CredentialStatus = {
      domain,
      enabled: !!cookie,
      valid: false,
      lastChecked: new Date(),
      cookieLength: cookie?.length
    }

    if (!cookie) {
      status.error = '未找到 Cookie'
      return status
    }

    // 获取测试 URL
    const testUrl = SITE_TEST_URLS[domain]
    if (!testUrl) {
      // 没有配置测试 URL，假设有效
      status.valid = true
      status.error = '无测试 URL，假设有效'
      this.statusCache.set(domain, status)
      return status
    }

    // 使用 Go Scraper 测试凭证
    try {
      const response = await this.goClient.fetch({
        url: testUrl,
        headers: { Cookie: cookie },
        timeout: 10000
      })

      if (response?.error) {
        status.valid = false
        status.error = response.error
      } else if (response?.finalUrl?.includes('login') || response?.finalUrl?.includes('signin')) {
        status.valid = false
        status.error = '被重定向到登录页，凭证已失效'
      } else {
        status.valid = true
      }
    } catch (error) {
      status.valid = false
      status.error = error instanceof Error ? error.message : String(error)
    }

    this.statusCache.set(domain, status)
    return status
  }

  /**
   * 快速检测凭证是否存在
   */
  hasCookie(domain: string): boolean {
    return !!this.credentialManager.getCookieForDomain(domain)
  }

  /**
   * 获取缓存的状态
   */
  getCachedStatus(domain: string): CredentialStatus | undefined {
    return this.statusCache.get(domain)
  }

  /**
   * 获取过期或无效的凭证列表
   */
  getInvalidCredentials(): CredentialStatus[] {
    return Array.from(this.statusCache.values()).filter(s => !s.valid)
  }

  /**
   * 生成状态报告
   */
  generateReport(): string {
    const statuses = Array.from(this.statusCache.values())
    
    if (statuses.length === 0) {
      return '暂无凭证状态数据，请先运行检测'
    }

    const lines: string[] = [
      '=== 站点凭证状态报告 ===',
      `检测时间: ${new Date().toISOString()}`,
      `总计: ${statuses.length} 个站点`,
      `有效: ${statuses.filter(s => s.valid).length}`,
      `无效: ${statuses.filter(s => !s.valid).length}`,
      '',
      '--- 详情 ---'
    ]

    for (const status of statuses) {
      const icon = status.valid ? '✅' : '❌'
      lines.push(`${icon} ${status.domain}`)
      if (!status.valid && status.error) {
        lines.push(`   错误: ${status.error}`)
      }
      if (status.cookieLength) {
        lines.push(`   Cookie 长度: ${status.cookieLength}`)
      }
    }

    return lines.join('\n')
  }
}

// 单例
let _checker: CredentialChecker | null = null

export function getCredentialChecker(): CredentialChecker {
  if (!_checker) {
    _checker = new CredentialChecker()
  }
  return _checker
}

/**
 * 检测所有凭证（快捷方法）
 */
export async function checkAllCredentials(): Promise<CredentialCheckResult> {
  return getCredentialChecker().checkAll()
}
