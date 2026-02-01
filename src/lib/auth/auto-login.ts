/**
 * 自动登录服务
 *
 * 通过 Browserless 自动登录网站获取 Cookie
 */

import { chromium, type Browser, type BrowserContext } from 'playwright'

/**
 * 登录配置
 */
export interface LoginConfig {
  /** 登录页面 URL */
  loginUrl: string
  /** 选择器配置 */
  selectors: {
    /** 用户名输入框 */
    username: string
    /** 密码输入框 */
    password: string
    /** 提交按钮 */
    submit: string
    /** 登录成功后出现的元素（可选） */
    successIndicator?: string
  }
  /** 登录前等待时间（毫秒） */
  preLoginDelay?: number
  /** 登录后等待时间（毫秒） */
  postLoginDelay?: number
}

/**
 * 登录结果
 */
export interface LoginResult {
  /** 是否成功 */
  success: boolean
  /** Cookie 字符串 */
  cookies?: string
  /** 错误信息 */
  error?: string
}

/**
 * 获取 Browserless 连接 URL
 */
function getBrowserlessUrl(): string {
  return process.env.BROWSERLESS_URL || 'ws://localhost:3300'
}

/**
 * 自动登录获取 Cookie
 *
 * @param config - 登录配置
 * @param username - 用户名
 * @param password - 密码
 * @returns 登录结果
 */
export async function autoLogin(
  config: LoginConfig,
  username: string,
  password: string
): Promise<LoginResult> {
  let browser: Browser | null = null
  let context: BrowserContext | null = null

  try {
    // 连接 Browserless
    browser = await chromium.connect(getBrowserlessUrl())
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })
    const page = await context.newPage()

    // 访问登录页
    await page.goto(config.loginUrl, { waitUntil: 'networkidle' })

    // 登录前等待
    if (config.preLoginDelay) {
      await page.waitForTimeout(config.preLoginDelay)
    }

    // 填写表单
    await page.fill(config.selectors.username, username)
    await page.fill(config.selectors.password, password)

    // 点击登录
    await page.click(config.selectors.submit)

    // 等待登录成功
    if (config.selectors.successIndicator) {
      await page.waitForSelector(config.selectors.successIndicator, { timeout: 15000 })
    } else {
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 })
    }

    // 登录后等待
    if (config.postLoginDelay) {
      await page.waitForTimeout(config.postLoginDelay)
    }

    // 提取 Cookie
    const cookies = await context.cookies()
    const cookieString = cookies
      .map(c => `${c.name}=${c.value}`)
      .join('; ')

    return {
      success: true,
      cookies: cookieString
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  } finally {
    if (context) {
      await context.close().catch(() => {})
    }
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}

/**
 * 验证 Cookie 是否有效
 *
 * @param url - 需要认证的页面 URL
 * @param cookies - Cookie 字符串
 * @param successIndicator - 登录成功的标识选择器
 * @returns 是否有效
 */
export async function validateCookies(
  url: string,
  cookies: string,
  successIndicator: string
): Promise<boolean> {
  let browser: Browser | null = null
  let context: BrowserContext | null = null

  try {
    browser = await chromium.connect(getBrowserlessUrl())
    context = await browser.newContext()

    // 解析并设置 Cookie
    const cookiePairs = cookies.split('; ').map(pair => {
      const [name, ...valueParts] = pair.split('=')
      return {
        name,
        value: valueParts.join('='),
        domain: new URL(url).hostname,
        path: '/'
      }
    })

    await context.addCookies(cookiePairs)

    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle' })

    // 检查是否存在登录成功标识
    const element = await page.$(successIndicator)
    return element !== null
  } catch {
    return false
  } finally {
    if (context) {
      await context.close().catch(() => {})
    }
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}
