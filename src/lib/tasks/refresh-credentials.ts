/**
 * 凭证刷新任务
 *
 * 自动刷新过期或即将过期的站点凭证
 */

import { prisma } from '../prisma'
import { decryptCredential, encryptCredential } from '../auth/credential-crypto'
import { autoLogin } from '../auth/auto-login'
import { getSiteLoginConfig } from '../auth/site-configs'

/**
 * 刷新结果
 */
export interface RefreshResult {
  /** 成功数量 */
  success: number
  /** 失败数量 */
  failed: number
  /** 跳过数量 */
  skipped: number
  /** 详细信息 */
  details: Array<{
    domain: string
    status: 'success' | 'failed' | 'skipped'
    message?: string
  }>
}

/**
 * 刷新过期或即将过期的凭证
 */
export async function refreshExpiredCredentials(): Promise<RefreshResult> {
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // 查找需要刷新的凭证
  const credentials = await prisma.siteCredential.findMany({
    where: {
      authType: 'login', // 只有 login 类型才能自动刷新
      OR: [
        { status: 'expired' },
        {
          refreshInterval: 'daily',
          OR: [
            { lastRefreshedAt: { lt: oneDayAgo } },
            { lastRefreshedAt: null }
          ]
        },
        {
          refreshInterval: 'weekly',
          OR: [
            { lastRefreshedAt: { lt: oneWeekAgo } },
            { lastRefreshedAt: null }
          ]
        }
      ]
    }
  })

  const result: RefreshResult = {
    success: 0,
    failed: 0,
    skipped: 0,
    details: []
  }

  for (const cred of credentials) {
    // 检查必要字段
    if (!cred.encryptedUsername || !cred.encryptedPassword) {
      result.skipped++
      result.details.push({
        domain: cred.domain,
        status: 'skipped',
        message: '缺少用户名或密码'
      })
      continue
    }

    // 获取登录配置
    let loginConfig = cred.loginUrl && cred.loginSelectors
      ? {
          loginUrl: cred.loginUrl,
          selectors: JSON.parse(cred.loginSelectors)
        }
      : getSiteLoginConfig(cred.domain)

    if (!loginConfig) {
      result.skipped++
      result.details.push({
        domain: cred.domain,
        status: 'skipped',
        message: '无登录配置'
      })
      continue
    }

    try {
      // 解密凭证
      const username = decryptCredential(cred.encryptedUsername)
      const password = decryptCredential(cred.encryptedPassword)

      console.log(`[RefreshCredentials] 刷新凭证: ${cred.domain}`)

      // 自动登录获取新 Cookie
      const loginResult = await autoLogin(loginConfig, username, password)

      if (loginResult.success && loginResult.cookies) {
        // 更新数据库
        await prisma.siteCredential.update({
          where: { id: cred.id },
          data: {
            encryptedCookie: encryptCredential(loginResult.cookies),
            status: 'active',
            lastRefreshedAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 天后过期
            errorMessage: null
          }
        })

        result.success++
        result.details.push({
          domain: cred.domain,
          status: 'success'
        })
        console.log(`✅ [RefreshCredentials] 刷新成功: ${cred.domain}`)
      } else {
        throw new Error(loginResult.error || '登录失败')
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'

      await prisma.siteCredential.update({
        where: { id: cred.id },
        data: {
          status: 'error',
          errorMessage: errorMsg
        }
      })

      result.failed++
      result.details.push({
        domain: cred.domain,
        status: 'failed',
        message: errorMsg
      })
      console.error(`❌ [RefreshCredentials] 刷新失败: ${cred.domain} - ${errorMsg}`)
    }
  }

  return result
}

/**
 * 刷新单个凭证
 */
export async function refreshCredential(credentialId: string): Promise<{
  success: boolean
  message: string
}> {
  const cred = await prisma.siteCredential.findUnique({
    where: { id: credentialId }
  })

  if (!cred) {
    return { success: false, message: '凭证不存在' }
  }

  if (cred.authType !== 'login') {
    return { success: false, message: '该凭证类型不支持自动刷新' }
  }

  if (!cred.encryptedUsername || !cred.encryptedPassword) {
    return { success: false, message: '缺少用户名或密码' }
  }

  // 获取登录配置
  let loginConfig = cred.loginUrl && cred.loginSelectors
    ? {
        loginUrl: cred.loginUrl,
        selectors: JSON.parse(cred.loginSelectors)
      }
    : getSiteLoginConfig(cred.domain)

  if (!loginConfig) {
    return { success: false, message: '无登录配置' }
  }

  try {
    const username = decryptCredential(cred.encryptedUsername)
    const password = decryptCredential(cred.encryptedPassword)

    const loginResult = await autoLogin(loginConfig, username, password)

    if (loginResult.success && loginResult.cookies) {
      await prisma.siteCredential.update({
        where: { id: cred.id },
        data: {
          encryptedCookie: encryptCredential(loginResult.cookies),
          status: 'active',
          lastRefreshedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          errorMessage: null
        }
      })

      return { success: true, message: '刷新成功' }
    } else {
      throw new Error(loginResult.error || '登录失败')
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'

    await prisma.siteCredential.update({
      where: { id: cred.id },
      data: {
        status: 'error',
        errorMessage: errorMsg
      }
    })

    return { success: false, message: errorMsg }
  }
}
