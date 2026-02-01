import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

// 重置密码
export async function POST(req: NextRequest) {
  try {
    const { email, code, newPassword } = await req.json()

    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: '密码至少 6 位' }, { status: 400 })
    }

    // 验证验证码
    const verificationCode = await prisma.verificationCode.findFirst({
      where: {
        email,
        code,
        type: 'RESET_PASSWORD',
        used: false,
        expiresAt: { gte: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    })

    if (!verificationCode) {
      return NextResponse.json({ error: '验证码无效或已过期' }, { status: 400 })
    }

    // 查找用户
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 })
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // 更新密码并标记验证码为已使用
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword }
      }),
      prisma.verificationCode.update({
        where: { id: verificationCode.id },
        data: { used: true }
      })
    ])

    return NextResponse.json({ message: '密码重置成功' })
  } catch (error) {
    console.error('重置密码失败:', error)
    return NextResponse.json({ error: '重置失败，请重试' }, { status: 500 })
  }
}
