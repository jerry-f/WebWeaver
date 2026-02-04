/**
 * Browserless Stealth 工具封装
 *
 * 提供统一的 Stealth 模式访问能力，绕过网站的反爬虫检测
 *
 * 【为什么需要 Stealth 模式？】
 * 默认的 Headless Chrome 会暴露以下特征：
 * - navigator.webdriver = true
 * - UserAgent 包含 "HeadlessChrome"
 * 这些特征会被网站检测到并拒绝访问
 *
 * 【使用方式】
 * import { BrowserlessClient } from './utils/browserless-client'
 *
 * const client = new BrowserlessClient()
 * const html = await client.getContent('https://example.com')
 * const screenshot = await client.screenshot('https://example.com')
 */

// Browserless 服务地址
const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'http://localhost:3300'

/**
 * Stealth 伪装脚本 - 隐藏自动化特征
 */
const STEALTH_SCRIPT = `
  // 1. 隐藏 webdriver 标志
  Object.defineProperty(navigator, 'webdriver', { get: () => false });

  // 2. 添加 chrome 对象
  window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };

  // 3. 模拟正常的语言设置
  Object.defineProperty(navigator, 'languages', {
    get: () => ['zh-CN', 'zh', 'en-US', 'en'],
  });

  // 4. 模拟插件
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const plugins = [
        { name: 'Chrome PDF Plugin' },
        { name: 'Chrome PDF Viewer' },
        { name: 'Native Client' }
      ];
      plugins.length = 3;
      return plugins;
    },
  });

  // 5. 修复 permissions API
  const originalQuery = navigator.permissions.query;
  navigator.permissions.query = (parameters) => (
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters)
  );
`

/**
 * 默认的 UserAgent（模拟 Windows Chrome）
 */
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

/**
 * 请求选项
 */
export interface RequestOptions {
  /** 等待策略 */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
  /** 超时时间（毫秒） */
  timeout?: number
  /** 视口宽度 */
  viewportWidth?: number
  /** 视口高度 */
  viewportHeight?: number
  /** 自定义 UserAgent */
  userAgent?: string
  /** 是否启用 Stealth 模式（默认 true） */
  stealth?: boolean
}

/**
 * 截图选项
 */
export interface ScreenshotOptions extends RequestOptions {
  /** 是否全页截图 */
  fullPage?: boolean
  /** 图片格式 */
  type?: 'png' | 'jpeg'
  /** JPEG 质量 (0-100) */
  quality?: number
}

/**
 * 抓取选项
 */
export interface ScrapeOptions extends RequestOptions {
  /** CSS 选择器列表 */
  selectors: string[]
}

/**
 * 抓取结果
 */
export interface ScrapeResult {
  selector: string
  results: Array<{
    text: string
    html: string
    attributes: Record<string, string>
  }>
}

/**
 * Browserless 客户端
 */
export class BrowserlessClient {
  private baseUrl: string

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || BROWSERLESS_URL
  }

  /**
   * 生成 Stealth 模式的 Function 代码
   */
  private generateStealthCode(action: string, options: RequestOptions = {}): string {
    const {
      waitUntil = 'networkidle2',
      timeout = 30000,
      viewportWidth = 1280,
      viewportHeight = 800,
      userAgent = DEFAULT_USER_AGENT,
      stealth = true
    } = options

    const stealthSetup = stealth ? `
      await page.evaluateOnNewDocument(() => {
        ${STEALTH_SCRIPT}
      });
      await page.setUserAgent('${userAgent}');
    ` : ''

    return `
      module.exports = async ({ page, context }) => {
        ${stealthSetup}
        await page.setViewport({ width: ${viewportWidth}, height: ${viewportHeight} });
        await page.goto(context.url, { waitUntil: '${waitUntil}', timeout: ${timeout} });
        ${action}
      };
    `
  }

  /**
   * 检查服务健康状态
   */
  async checkHealth(): Promise<{
    isAvailable: boolean
    cpu: number
    memory: number
    running: number
    maxConcurrent: number
    queued: number
  }> {
    const response = await fetch(`${this.baseUrl}/pressure`, {
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      throw new Error(`健康检查失败: ${response.status}`)
    }

    const { pressure } = await response.json()
    return {
      isAvailable: pressure.isAvailable,
      cpu: pressure.cpu,
      memory: pressure.memory,
      running: pressure.running,
      maxConcurrent: pressure.maxConcurrent,
      queued: pressure.queued
    }
  }

  /**
   * 获取页面内容（HTML）
   */
  async getContent(url: string, options: RequestOptions = {}): Promise<string> {
    const code = this.generateStealthCode(
      `return { data: await page.content(), type: 'text/html' };`,
      options
    )

    const response = await fetch(`${this.baseUrl}/function`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, context: { url } })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`获取内容失败: ${error.substring(0, 200)}`)
    }

    return response.text()
  }

  /**
   * 页面截图
   */
  async screenshot(url: string, options: ScreenshotOptions = {}): Promise<Buffer> {
    const { fullPage = false, type = 'png', quality = 80 } = options

    const screenshotOptions = type === 'jpeg'
      ? `{ type: 'jpeg', quality: ${quality}, fullPage: ${fullPage} }`
      : `{ type: 'png', fullPage: ${fullPage} }`

    const code = this.generateStealthCode(
      `const buf = await page.screenshot(${screenshotOptions}); return { data: buf, type: 'image/${type}' };`,
      options
    )

    const response = await fetch(`${this.baseUrl}/function`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, context: { url } })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`截图失败: ${error.substring(0, 200)}`)
    }

    return Buffer.from(await response.arrayBuffer())
  }

  /**
   * 通过选择器抓取内容
   */
  async scrape(url: string, options: ScrapeOptions): Promise<ScrapeResult[]> {
    const { selectors } = options

    const scrapeAction = `
      const results = [];
      for (const selector of context.selectors) {
        const elements = await page.$$(selector);
        const items = [];
        for (const el of elements) {
          const text = await el.evaluate(e => e.textContent || '');
          const html = await el.evaluate(e => e.outerHTML);
          const attributes = await el.evaluate(e => {
            const attrs = {};
            for (const attr of e.attributes) {
              attrs[attr.name] = attr.value;
            }
            return attrs;
          });
          items.push({ text: text.trim(), html, attributes });
        }
        results.push({ selector, results: items });
      }
      return { data: results, type: 'application/json' };
    `

    const code = this.generateStealthCode(scrapeAction, options)

    const response = await fetch(`${this.baseUrl}/function`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, context: { url, selectors } })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`抓取失败: ${error.substring(0, 200)}`)
    }

    return response.json()
  }

  /**
   * 执行自定义 Puppeteer 脚本
   */
  async execute<T>(url: string, script: string, options: RequestOptions = {}): Promise<T> {
    const code = this.generateStealthCode(script, options)

    const response = await fetch(`${this.baseUrl}/function`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, context: { url } })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`执行失败: ${error.substring(0, 200)}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      return response.json()
    }
    return response.text() as T
  }

  /**
   * 生成 PDF
   */
  async pdf(url: string, options: RequestOptions & {
    format?: 'A4' | 'Letter' | 'Legal' // 纸张格式 (默认 A4、 Letter、Legal)
    landscape?: boolean // 横向
    printBackground?: boolean // 是否打印背景图
  } = {}): Promise<Buffer> {
    const {
      format = 'A4',
      landscape = false,
      printBackground = true
    } = options

    const pdfOptions = `{ format: '${format}', landscape: ${landscape}, printBackground: ${printBackground} }`

    const code = this.generateStealthCode(
      `const buf = await page.pdf(${pdfOptions}); return { data: buf, type: 'application/pdf' };`,
      options
    )

    const response = await fetch(`${this.baseUrl}/function`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, context: { url } })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`PDF 生成失败: ${error.substring(0, 200)}`)
    }

    return Buffer.from(await response.arrayBuffer())
  }
}

/**
 * 默认客户端实例
 */
export const browserless = new BrowserlessClient()

/**
 * 便捷函数：获取页面内容
 */
export async function getContent(url: string, options?: RequestOptions): Promise<string> {
  return browserless.getContent(url, options)
}

/**
 * 便捷函数：页面截图
 */
export async function screenshot(url: string, options?: ScreenshotOptions): Promise<Buffer> {
  return browserless.screenshot(url, options)
}

/**
 * 便捷函数：抓取内容
 */
export async function scrape(url: string, selectors: string[], options?: RequestOptions): Promise<ScrapeResult[]> {
  return browserless.scrape(url, { ...options, selectors })
}
