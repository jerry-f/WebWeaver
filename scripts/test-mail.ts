/**
 * 邮件发送测试脚本
 * 运行: npx tsx scripts/test-mail.ts
 */

import { sendVerificationEmail, sendPasswordResetEmail } from '../src/lib/mail'

async function testMail() {
  console.log('📧 开始邮件发送测试...\n')

  const testEmail = 'test@example.com'

  try {
    // 测试验证码邮件
    console.log('1. 发送验证码邮件...')
    const verifyResult = await sendVerificationEmail(testEmail, '123456')
    console.log(`   ✅ 成功! MessageId: ${verifyResult.messageId}\n`)

    // 测试密码重置邮件
    console.log('2. 发送密码重置邮件...')
    const resetResult = await sendPasswordResetEmail(
      testEmail,
      'http://localhost:3000/reset-password?token=abc123'
    )
    console.log(`   ✅ 成功! MessageId: ${resetResult.messageId}\n`)

    console.log('🎉 所有测试通过!')
    console.log('📬 请访问 http://localhost:8025 查看邮件')
  } catch (error) {
    console.error('❌ 邮件发送失败:', error)
    process.exit(1)
  }
}

testMail()
