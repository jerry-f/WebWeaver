/**
 * 凭证有效性检测 API
 * 
 * POST /api/credentials/check - 检测凭证有效性
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { CredentialManager } from '@/lib/auth/credential-manager'
import { GoScraperClient } from '@/lib/fetchers/clients/go-scraper'

// 测试 URL 配置
const TEST_URLS: Record<string, string> = {
  'zhihu.com': 'https://zhuanlan.zhihu.com/p/493407868',
  'medium.com': 'https://medium.com/me/settings',
  'juejin.cn': 'https://juejin.cn/user/center/signin',
}

/**
 * POST /api/credentials/check - 检测凭证有效性
 */
export async function POST(request: Request) {
  try {
    // 验证权限
    const session = await auth()
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { domain } = body
    
    const manager = new CredentialManager()
    const goClient = new GoScraperClient()
    
    // 如果指定了域名，只检测该域名
    const allCredentials = manager.getAllCredentials()
    const domainsToCheck = domain 
      ? [domain]
      : allCredentials.map(c => c.domain)
    
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
