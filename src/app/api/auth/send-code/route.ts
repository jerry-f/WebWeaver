import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendVerificationEmail } from '@/lib/mail'

// 生成 6 位数字验证码
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// 发送验证码
export async function POST(req: NextRequest) {
  try {
    const { email, type } = await req.json()

    if (!email) {
      return NextResponse.json({ error: '邮箱是必填项' }, { status: 400 })
    }

    const validTypes = ['REGISTER', 'RESET_PASSWORD', 'EMAIL_CHANGE']
    if (!type || !validTypes.includes(type)) {
      return NextResponse.json({ error: '无效的验证码类型' }, { status: 400 })
    }

    // 注册时检查邮箱是否已存在
    if (type === 'REGISTER') {
      const existingUser = await prisma.user.findUnique({ where: { email } })
      if (existingUser) {
        return NextResponse.json({ error: '该邮箱已被注册' }, { status: 400 })
      }
    }

    // 重置密码时检查邮箱是否存在
    if (type === 'RESET_PASSWORD') {
      const existingUser = await prisma.user.findUnique({ where: { email } })
      if (!existingUser) {
        // 为了安全，不透露邮箱是否存在
        return NextResponse.json({ message: '如果邮箱存在，验证码已发送' })
      }
    }

    // 检查是否频繁发送（1分钟内只能发一次）
    const recentCode = await prisma.verificationCode.findFirst({
      where: {
        email,
        type,
        createdAt: { gte: new Date(Date.now() - 60 * 1000) }
      }
    })

    if (recentCode) {
      return NextResponse.json(
        { error: '发送太频繁，请稍后再试' },
        { status: 429 }
      )
    }

    // 生成验证码
    const code = generateCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10分钟后过期

    // 保存验证码
    await prisma.verificationCode.create({
      data: {
        email,
        code,
        type,
        expiresAt,
      }
    })

    // 发送邮件
    await sendVerificationEmail(email, code)

    return NextResponse.json({ message: '验证码已发送' })
  } catch (error) {
    console.error('发送验证码失败:', error)
    return NextResponse.json({ error: '发送失败，请重试' }, { status: 500 })
  }
}
