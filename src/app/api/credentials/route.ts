/**
 * 凭证管理 API
 * 
 * GET  /api/credentials       - 列出所有凭证
 * POST /api/credentials       - 添加凭证
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { CredentialManager } from '@/lib/auth/credential-manager'

/**
 * GET /api/credentials - 列出所有凭证
 */
export async function GET() {
  try {
    // 验证权限
    const session = await auth()
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const manager = new CredentialManager()
    const credentials = manager.getAllCredentials()
    
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
 * POST /api/credentials - 添加凭证
 */
export async function POST(request: Request) {
  try {
    // 验证权限
    const session = await auth()
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await request.json()
    const { domain, cookie, note } = body

    if (!domain) {
      return NextResponse.json({ error: '域名不能为空' }, { status: 400 })
    }

    if (!cookie) {
      return NextResponse.json({ error: 'Cookie 不能为空' }, { status: 400 })
    }

    const manager = new CredentialManager()
    manager.addCredential(domain, cookie, { note })
    
    return NextResponse.json({ 
      success: true,
      message: `已添加 ${domain} 的凭证`
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
