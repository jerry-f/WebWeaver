/**
 * 单个凭证管理 API
 * 
 * GET    /api/credentials/[domain] - 获取凭证详情
 * PUT    /api/credentials/[domain] - 更新凭证
 * DELETE /api/credentials/[domain] - 删除凭证
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { CredentialManager } from '@/lib/auth/credential-manager'

interface RouteParams {
  params: Promise<{ domain: string }>
}

/**
 * GET /api/credentials/[domain] - 获取凭证详情
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { domain } = await params
    const decodedDomain = decodeURIComponent(domain)
    
    const manager = new CredentialManager()
    const credentials = manager.getAllCredentials()
    const credential = credentials.find(c => c.domain === decodedDomain)
    
    if (!credential) {
      return NextResponse.json({ error: '凭证不存在' }, { status: 404 })
    }
    
    return NextResponse.json(credential)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/credentials/[domain] - 更新凭证 Cookie
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { domain } = await params
    const decodedDomain = decodeURIComponent(domain)
    const body = await request.json()
    const { cookie } = body

    if (!cookie) {
      return NextResponse.json({ error: 'Cookie 不能为空' }, { status: 400 })
    }

    const manager = new CredentialManager()
    const success = manager.updateCookie(decodedDomain, cookie)
    
    if (!success) {
      return NextResponse.json({ error: '凭证不存在' }, { status: 404 })
    }
    
    return NextResponse.json({ 
      success: true,
      message: `已更新 ${decodedDomain} 的凭证`
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/credentials/[domain] - 删除凭证
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { domain } = await params
    const decodedDomain = decodeURIComponent(domain)
    
    const manager = new CredentialManager()
    const success = manager.removeCredential(decodedDomain)
    
    if (!success) {
      return NextResponse.json({ error: '凭证不存在' }, { status: 404 })
    }
    
    return NextResponse.json({ 
      success: true,
      message: `已删除 ${decodedDomain} 的凭证`
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
