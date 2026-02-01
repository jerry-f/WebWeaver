/**
 * 凭证加密服务
 *
 * 使用 AES-256-GCM 加密存储敏感凭证
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const SALT = 'newsflow-credential-salt'

/**
 * 获取加密密钥
 * 从环境变量读取主密钥，使用 scrypt 派生 256 位密钥
 */
function getKey(): Buffer {
  const secret = process.env.CREDENTIAL_SECRET
  if (!secret) {
    throw new Error('CREDENTIAL_SECRET 环境变量未设置')
  }
  return scryptSync(secret, SALT, 32)
}

/**
 * 加密凭证
 *
 * @param plaintext - 明文凭证
 * @returns 加密后的字符串（格式：iv:authTag:encrypted）
 */
export function encryptCredential(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  // 格式：iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * 解密凭证
 *
 * @param encrypted - 加密后的字符串
 * @returns 明文凭证
 */
export function decryptCredential(encrypted: string): string {
  const key = getKey()
  const parts = encrypted.split(':')

  if (parts.length !== 3) {
    throw new Error('无效的加密凭证格式')
  }

  const [ivHex, authTagHex, encryptedData] = parts

  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)

  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * 检查凭证是否已加密
 *
 * @param value - 要检查的值
 * @returns 是否是加密格式
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  if (parts.length !== 3) return false

  // 检查格式：32字符iv + 32字符authTag + 加密数据
  return parts[0].length === 32 && parts[1].length === 32 && parts[2].length > 0
}
