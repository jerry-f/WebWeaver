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
 * PUT /api/credentials/[domain] - 更新凭证 Cookie、启用状态或测试 URL
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
    const { cookie, enabled, testUrl } = body

    const manager = new CredentialManager()

    // 更新启用状态
    if (typeof enabled === 'boolean') {
      const success = manager.setEnabled(decodedDomain, enabled)
      if (!success) {
        return NextResponse.json({ error: '凭证不存在' }, { status: 404 })
      }
      return NextResponse.json({
        success: true,
        message: `已${enabled ? '启用' : '禁用'} ${decodedDomain} 的凭证`
      })
    }

    // 更新测试 URL
    if (typeof testUrl === 'string') {
      const success = manager.setTestUrl(decodedDomain, testUrl)
      if (!success) {
        return NextResponse.json({ error: '凭证不存在' }, { status: 404 })
      }
      return NextResponse.json({
        success: true,
        message: `已更新 ${decodedDomain} 的测试 URL`
      })
    }

    // 更新 Cookie
    if (cookie) {
      const success = manager.updateCookie(decodedDomain, cookie)
      if (!success) {
        return NextResponse.json({ error: '凭证不存在' }, { status: 404 })
      }
      return NextResponse.json({
        success: true,
        message: `已更新 ${decodedDomain} 的凭证`
      })
    }

    return NextResponse.json({ error: '请提供 cookie、enabled 或 testUrl 参数' }, { status: 400 })
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
