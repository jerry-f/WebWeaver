import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 验证验证码
export async function POST(req: NextRequest) {
  try {
    const { email, code, type } = await req.json()

    if (!email || !code || !type) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 })
    }

    // 查找有效的验证码
    const verificationCode = await prisma.verificationCode.findFirst({
      where: {
        email,
        code,
        type,
        used: false,
        expiresAt: { gte: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    })

    if (!verificationCode) {
      return NextResponse.json({ error: '验证码无效或已过期' }, { status: 400 })
    }

    // 标记为已使用
    await prisma.verificationCode.update({
      where: { id: verificationCode.id },
      data: { used: true }
    })

    return NextResponse.json({
      valid: true,
      message: '验证成功'
    })
  } catch (error) {
    console.error('验证码验证失败:', error)
    return NextResponse.json({ error: '验证失败' }, { status: 500 })
  }
}
