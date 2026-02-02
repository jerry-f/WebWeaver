import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publishConfigReload } from '@/lib/queue/redis'

// 默认域名限速配置（用于恢复默认）
const defaultDomainLimits = [
  { domain: '*', maxConcurrent: 10, rps: 10, description: '默认配置' },
  { domain: 'medium.com', maxConcurrent: 2, rps: 1, description: '严格限制' },
  { domain: 'twitter.com', maxConcurrent: 1, rps: 0.5, description: '严格限制' },
  { domain: 'x.com', maxConcurrent: 1, rps: 0.5, description: '严格限制' },
  { domain: 'zhihu.com', maxConcurrent: 3, rps: 2, description: '中等限制' },
  { domain: 'juejin.cn', maxConcurrent: 3, rps: 2, description: '中等限制' },
  { domain: 'segmentfault.com', maxConcurrent: 3, rps: 2, description: '中等限制' },
  { domain: 'mp.weixin.qq.com', maxConcurrent: 5, rps: 5, description: '宽松限制' },
  { domain: 'weixin.qq.com', maxConcurrent: 5, rps: 5, description: '宽松限制' },
  { domain: 'github.com', maxConcurrent: 5, rps: 3, description: '宽松限制' },
]

// 检查管理员权限
async function checkAdminPermission() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { error: '未登录', status: 401 }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  })

  if (user?.role !== 'admin') {
    return { error: '无权限', status: 403 }
  }

  return null
}

// 获取所有域名限速配置
export async function GET() {
  const permError = await checkAdminPermission()
  if (permError) {
    return NextResponse.json({ error: permError.error }, { status: permError.status })
  }

  const limits = await prisma.domainRateLimit.findMany({
    orderBy: [
      { domain: 'asc' }
    ]
  })

  return NextResponse.json({ limits })
}

// 添加域名限速配置
export async function POST(req: NextRequest) {
  const permError = await checkAdminPermission()
  if (permError) {
    return NextResponse.json({ error: permError.error }, { status: permError.status })
  }

  const { domain, maxConcurrent, rps, description } = await req.json()

  if (!domain) {
    return NextResponse.json({ error: '缺少域名' }, { status: 400 })
  }

  // 检查是否已存在
  const existing = await prisma.domainRateLimit.findUnique({
    where: { domain }
  })

  if (existing) {
    return NextResponse.json({ error: '该域名配置已存在' }, { status: 400 })
  }

  const limit = await prisma.domainRateLimit.create({
    data: {
      domain,
      maxConcurrent: maxConcurrent ?? 10,
      rps: rps ?? 10,
      description
    }
  })

  // 通知 Worker 重载配置
  await publishConfigReload('rate-limits')

  return NextResponse.json({ limit })
}

// 更新域名限速配置
export async function PUT(req: NextRequest) {
  const permError = await checkAdminPermission()
  if (permError) {
    return NextResponse.json({ error: permError.error }, { status: permError.status })
  }

  const { id, maxConcurrent, rps, description } = await req.json()

  if (!id) {
    return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  }

  const limit = await prisma.domainRateLimit.update({
    where: { id },
    data: {
      maxConcurrent,
      rps,
      description
    }
  })

  // 通知 Worker 重载配置
  await publishConfigReload('rate-limits')

  return NextResponse.json({ limit })
}

// 删除域名限速配置
export async function DELETE(req: NextRequest) {
  const permError = await checkAdminPermission()
  if (permError) {
    return NextResponse.json({ error: permError.error }, { status: permError.status })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  }

  // 检查是否为默认配置（*）
  const limit = await prisma.domainRateLimit.findUnique({
    where: { id }
  })

  if (limit?.domain === '*') {
    return NextResponse.json({ error: '不能删除默认配置' }, { status: 400 })
  }

  await prisma.domainRateLimit.delete({
    where: { id }
  })

  // 通知 Worker 重载配置
  await publishConfigReload('rate-limits')

  return NextResponse.json({ success: true })
}

// 恢复默认配置
export async function PATCH() {
  const permError = await checkAdminPermission()
  if (permError) {
    return NextResponse.json({ error: permError.error }, { status: permError.status })
  }

  // 删除所有现有配置
  await prisma.domainRateLimit.deleteMany()

  // 重新创建默认配置
  await prisma.domainRateLimit.createMany({
    data: defaultDomainLimits
  })

  // 通知 Worker 重载配置
  await publishConfigReload('rate-limits')

  const limits = await prisma.domainRateLimit.findMany({
    orderBy: { domain: 'asc' }
  })

  return NextResponse.json({ limits, message: '已恢复默认配置' })
}
