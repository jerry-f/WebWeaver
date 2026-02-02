/**
 * 凭证状态 API
 * 
 * GET  /api/credentials       - 列出所有凭证状态
 * POST /api/credentials/check - 检测凭证有效性
 */

import { NextResponse } from 'next/server'
import { CredentialManager } from '@/lib/auth/credential-manager'
import { GoScraperClient } from '@/lib/fetchers/clients/go-scraper'

// 测试 URL 配置
const TEST_URLS: Record<string, string> = {
  'zhihu.com': 'https://zhuanlan.zhihu.com/p/493407868',
  'medium.com': 'https://medium.com/me/settings',
  'juejin.cn': 'https://juejin.cn/user/center/signin',
}

/**
 * GET /api/credentials - 列出所有凭证状态
 */
export async function GET() {
  try {
    const manager = new CredentialManager()
    const domains = manager.getAuthenticatedDomains()
    const uniqueDomains = [...new Set(domains.map(d => d.replace(/^www\./, '')))]
    
    const credentials = uniqueDomains.map(domain => {
      const cookie = manager.getCookieForDomain(domain)
      return {
        domain,
        enabled: !!cookie,
        cookieLength: cookie?.length || 0,
        hasTestUrl: !!TEST_URLS[domain]
      }
    })
    
    return NextResponse.json({
      total: credentials.length,
      credentials
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/credentials/check - 检测凭证有效性
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { domain } = body
    
    const manager = new CredentialManager()
    const goClient = new GoScraperClient()
    
    // 如果指定了域名，只检测该域名
    const domainsToCheck = domain 
      ? [domain]
      : [...new Set(manager.getAuthenticatedDomains().map(d => d.replace(/^www\./, '')))]
    
    const results = []
    
    for (const d of domainsToCheck) {
      const cookie = manager.getCookieForDomain(d)
      
      if (!cookie) {
        results.push({
          domain: d,
          valid: false,
          error: 'Cookie 未配置'
        })
        continue
      }
      
      const testUrl = TEST_URLS[d]
      if (!testUrl) {
        results.push({
          domain: d,
          valid: true,
          note: '无测试 URL，假设有效'
        })
        continue
      }
      
      // 测试抓取
      try {
        const response = await goClient.fetch({
          url: testUrl,
          headers: { Cookie: cookie },
          timeout: 15000
        })
        
        if (response?.title && !response.error) {
          results.push({
            domain: d,
            valid: true,
            title: response.title
          })
        } else {
          results.push({
            domain: d,
            valid: false,
            error: response?.error || '无法获取内容'
          })
        }
      } catch (error) {
        results.push({
          domain: d,
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    const valid = results.filter(r => r.valid).length
    const invalid = results.filter(r => !r.valid).length
    
    return NextResponse.json({
      total: results.length,
      valid,
      invalid,
      results
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
