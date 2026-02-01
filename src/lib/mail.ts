import nodemailer from 'nodemailer'

// 邮件发送器配置
// 开发环境使用 MailHog (localhost:1025)
// 生产环境使用真实 SMTP 服务
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '1025'),
  secure: false, // MailHog 不需要 TLS
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  } : undefined,
})

interface SendMailOptions {
  to: string
  subject: string
  text?: string
  html?: string
}

/**
 * 发送邮件
 * @param options 邮件选项
 * @returns 发送结果
 */
export async function sendMail(options: SendMailOptions) {
  const { to, subject, text, html } = options

  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@newsflow.local',
    to,
    subject,
    text,
    html,
  })

  return result
}

/**
 * 发送验证码邮件
 * @param email 收件人邮箱
 * @param code 验证码
 */
export async function sendVerificationEmail(email: string, code: string) {
  return sendMail({
    to: email,
    subject: 'NewsFlow - 邮箱验证码',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">邮箱验证</h2>
        <p>您的验证码是：</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #333;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 20px;">
          验证码有效期为 10 分钟，请勿将验证码告知他人。
        </p>
        <p style="color: #999; font-size: 12px;">
          如果这不是您的操作，请忽略此邮件。
        </p>
      </div>
    `,
  })
}

/**
 * 发送密码重置邮件
 * @param email 收件人邮箱
 * @param resetLink 重置链接
 */
export async function sendPasswordResetEmail(email: string, resetLink: string) {
  return sendMail({
    to: email,
    subject: 'NewsFlow - 重置密码',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">重置密码</h2>
        <p>您请求重置密码，请点击下面的按钮：</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background: #d4380d; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            重置密码
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          链接有效期为 1 小时。如果按钮无法点击，请复制以下链接到浏览器：
        </p>
        <p style="color: #999; font-size: 12px; word-break: break-all;">
          ${resetLink}
        </p>
        <p style="color: #999; font-size: 12px; margin-top: 20px;">
          如果这不是您的操作，请忽略此邮件。
        </p>
      </div>
    `,
  })
}
