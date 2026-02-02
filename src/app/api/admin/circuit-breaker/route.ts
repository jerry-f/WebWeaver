import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publishConfigReload } from '@/lib/queue/redis'

// 默认熔断配置
const defaultCircuitBreaker = {
  failThreshold: 5,      // 触发熔断的连续失败次数
  openDuration: 300,     // 熔断持续时间（秒）
  maxBackoff: 60,        // 最大退避时间（秒）
  initialBackoff: 1,     // 初始退避时间（秒）
}

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

// 获取熔断配置
export async function GET() {
  const permError = await checkAdminPermission()
  if (permError) {
    return NextResponse.json({ error: permError.error }, { status: permError.status })
  }

  const config = await prisma.systemConfig.findUnique({
    where: { key: 'circuitBreaker' }
  })

  if (!config) {
    // 如果不存在，返回默认配置
    return NextResponse.json({ config: defaultCircuitBreaker })
  }

  return NextResponse.json({ config: JSON.parse(config.value) })
}

// 更新熔断配置
export async function PUT(req: NextRequest) {
  const permError = await checkAdminPermission()
  if (permError) {
    return NextResponse.json({ error: permError.error }, { status: permError.status })
  }

  const { failThreshold, openDuration, maxBackoff, initialBackoff } = await req.json()

  // 验证参数
  if (failThreshold < 1 || failThreshold > 100) {
    return NextResponse.json({ error: '失败阈值必须在 1-100 之间' }, { status: 400 })
  }
  if (openDuration < 10 || openDuration > 3600) {
    return NextResponse.json({ error: '熔断时间必须在 10-3600 秒之间' }, { status: 400 })
  }
  if (maxBackoff < 1 || maxBackoff > 300) {
    return NextResponse.json({ error: '最大退避时间必须在 1-300 秒之间' }, { status: 400 })
  }
  if (initialBackoff < 1 || initialBackoff > 60) {
    return NextResponse.json({ error: '初始退避时间必须在 1-60 秒之间' }, { status: 400 })
  }

  const configValue = {
    failThreshold,
    openDuration,
    maxBackoff,
    initialBackoff
  }

  await prisma.systemConfig.upsert({
    where: { key: 'circuitBreaker' },
    update: { value: JSON.stringify(configValue) },
    create: { key: 'circuitBreaker', value: JSON.stringify(configValue) }
  })

  // 通知 Worker 重载配置
  await publishConfigReload('circuit-breaker')

  return NextResponse.json({ config: configValue })
}

// 恢复默认配置
export async function PATCH() {
  const permError = await checkAdminPermission()
  if (permError) {
    return NextResponse.json({ error: permError.error }, { status: permError.status })
  }

  await prisma.systemConfig.upsert({
    where: { key: 'circuitBreaker' },
    update: { value: JSON.stringify(defaultCircuitBreaker) },
    create: { key: 'circuitBreaker', value: JSON.stringify(defaultCircuitBreaker) }
  })

  // 通知 Worker 重载配置
  await publishConfigReload('circuit-breaker')

  return NextResponse.json({ config: defaultCircuitBreaker, message: '已恢复默认配置' })
}
