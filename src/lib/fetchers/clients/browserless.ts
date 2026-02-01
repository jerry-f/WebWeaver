/**
 * Browserless 客户端
 *
 * 通过 Browserless 服务进行动态页面渲染
 * 用于处理需要 JavaScript 渲染的 SPA 页面
 */

import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { sanitizeHtml } from '../processors/html-sanitizer'
import { processImages, type ExtractedImage } from '../processors/image-processor'

/**
 * Browserless 配置
 */
export interface BrowserlessConfig {
  /** Browserless 服务 URL */
  endpoint: string
  /** 超时时间（毫秒） */
  timeout?: number
  /** 是否等待网络空闲 */
  waitForNetworkIdle?: boolean
  /** 滚动加载配置 */
  scroll?: {
    enabled: boolean
    maxScrolls?: number
    scrollDelay?: number
  }
  /** 阻止的资源类型 */
  blockResources?: string[]
}

/**
 * 渲染结果
 */
export interface RenderResult {
  /** HTML 内容 */
  html: string
  /** 最终 URL（可能有重定向） */
  finalUrl: string
  /** 渲染耗时（毫秒） */
  duration: number
}

/**
 * 全文提取结果
 */
export interface BrowserlessFullTextResult {
  content: string
  textContent: string
  title?: string
  excerpt?: string
  byline?: string
  siteName?: string
  images?: ExtractedImage[]
  strategy: 'browserless'
  duration: number
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: BrowserlessConfig = {
  endpoint: process.env.BROWSERLESS_URL || 'ws://localhost:3300',
  timeout: 30000,
  waitForNetworkIdle: true,
  scroll: {
    enabled: false,
    maxScrolls: 3,
    scrollDelay: 1000
  },
  blockResources: ['font', 'media']
}

/**
 * 懒加载属性列表
 */
const LAZY_ATTRIBUTES = [
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-actualsrc',
  'data-hi-res-src',
  'data-lazy',
  'data-echo'
]

/**
 * 通过 Browserless 渲染页面
 *
 * @param url - 目标 URL
 * @param config - 配置选项
 * @returns 渲染后的 HTML
 */
export async function renderPage(
  url: string,
  config: Partial<BrowserlessConfig> = {}
): Promise<RenderResult | null> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const startTime = Date.now()

  try {
    // 构建 Browserless content API 请求
    // 使用 HTTP API 而非 WebSocket（更简单）
    const httpEndpoint = cfg.endpoint
      .replace('ws://', 'http://')
      .replace('wss://', 'https://')

    const response = await fetch(`${httpEndpoint}/content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        // 等待选项
        waitForTimeout: cfg.waitForNetworkIdle ? 3000 : 1000,
        waitForSelector: 'body',
        // 阻止不必要的资源
        rejectResourceTypes: cfg.blockResources,
        // 浏览器配置
        gotoOptions: {
          waitUntil: cfg.waitForNetworkIdle ? 'networkidle2' : 'domcontentloaded',
          timeout: cfg.timeout
        }
      }),
      signal: AbortSignal.timeout(cfg.timeout || 30000)
    })

    if (!response.ok) {
      console.error('Browserless render failed:', response.status, response.statusText)
      return null
    }

    const html = await response.text()
    const duration = Date.now() - startTime

    return {
      html,
      finalUrl: url, // Browserless content API 不返回最终 URL
      duration
    }
  } catch (error) {
    console.error('Browserless render error:', url, error)
    return null
  }
}

/**
 * 通过 Browserless 渲染并滚动加载页面
 *
 * 用于处理无限滚动的页面
 *
 * @param url - 目标 URL
 * @param config - 配置选项
 * @returns 渲染后的 HTML
 */
export async function renderWithScroll(
  url: string,
  config: Partial<BrowserlessConfig> = {}
): Promise<RenderResult | null> {
  const cfg = {
    ...DEFAULT_CONFIG,
    ...config,
    scroll: { ...DEFAULT_CONFIG.scroll, ...config.scroll, enabled: true }
  }
  const startTime = Date.now()

  try {
    const httpEndpoint = cfg.endpoint
      .replace('ws://', 'http://')
      .replace('wss://', 'https://')

    // 使用 function API 执行自定义脚本
    const response = await fetch(`${httpEndpoint}/function`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: `
          module.exports = async ({ page, context }) => {
            const { url, maxScrolls, scrollDelay } = context;

            await page.goto(url, {
              waitUntil: 'networkidle2',
              timeout: 30000
            });

            // 滚动加载
            for (let i = 0; i < maxScrolls; i++) {
              await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
              });
              await new Promise(r => setTimeout(r, scrollDelay));
            }

            // 回到顶部
            await page.evaluate(() => window.scrollTo(0, 0));

            return { data: await page.content(), type: 'text/html' };
          };
        `,
        context: {
          url,
          maxScrolls: cfg.scroll?.maxScrolls || 3,
          scrollDelay: cfg.scroll?.scrollDelay || 1000
        }
      }),
      signal: AbortSignal.timeout((cfg.timeout || 30000) + (cfg.scroll?.maxScrolls || 3) * (cfg.scroll?.scrollDelay || 1000))
    })

    if (!response.ok) {
      console.error('Browserless scroll render failed:', response.status)
      return null
    }

    const html = await response.text()
    const duration = Date.now() - startTime

    return {
      html,
      finalUrl: url,
      duration
    }
  } catch (error) {
    console.error('Browserless scroll render error:', url, error)
    return null
  }
}

/**
 * 通过 Browserless 抓取文章全文
 *
 * 完整流程：渲染 -> 懒加载处理 -> Readability 提取 -> 图片处理 -> HTML 净化
 *
 * @param url - 文章 URL
 * @param config - 配置选项
 * @returns 提取的文章内容
 */
export async function fetchFullTextWithBrowserless(
  url: string,
  config: Partial<BrowserlessConfig> = {}
): Promise<BrowserlessFullTextResult | null> {
  const startTime = Date.now()

  // 根据配置决定是否使用滚动加载
  const renderResult = config.scroll?.enabled
    ? await renderWithScroll(url, config)
    : await renderPage(url, config)

  if (!renderResult) return null

  try {
    // 解析 HTML
    const dom = new JSDOM(renderResult.html, { url })
    const document = dom.window.document

    // 处理懒加载图片
    const imgElements = document.querySelectorAll('img')
    imgElements.forEach((img) => {
      for (const attr of LAZY_ATTRIBUTES) {
        const lazySrc = img.getAttribute(attr)
        if (lazySrc && (lazySrc.startsWith('http') || lazySrc.startsWith('/'))) {
          img.setAttribute('src', lazySrc)
          break
        }
      }
      const dataSrcset = img.getAttribute('data-srcset')
      if (dataSrcset) {
        img.setAttribute('srcset', dataSrcset)
      }
    })

    // 使用 Readability 提取正文
    const reader = new Readability(document)
    const article = reader.parse()

    if (!article || !article.content) return null

    // 处理图片（URL 绝对化）
    const { html: processedHtml, images } = processImages(article.content, url, {
      enableProxy: false,
      lazyAttributes: LAZY_ATTRIBUTES
    })

    // HTML 净化
    const sanitizedHtml = sanitizeHtml(processedHtml)

    const duration = Date.now() - startTime

    return {
      content: sanitizedHtml,
      textContent: article.textContent?.trim() || '',
      title: article.title || undefined,
      excerpt: article.excerpt || undefined,
      byline: article.byline || undefined,
      siteName: article.siteName || undefined,
      images,
      strategy: 'browserless',
      duration
    }
  } catch (error) {
    console.error('Browserless fulltext extraction error:', url, error)
    return null
  }
}

/**
 * 检查 Browserless 服务是否可用
 *
 * @param config - 配置选项
 * @returns 是否可用
 */
export async function checkBrowserlessHealth(
  config: Partial<BrowserlessConfig> = {}
): Promise<boolean> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  try {
    const httpEndpoint = cfg.endpoint
      .replace('ws://', 'http://')
      .replace('wss://', 'https://')

    const response = await fetch(`${httpEndpoint}/pressure`, {
      signal: AbortSignal.timeout(5000)
    })

    return response.ok
  } catch {
    return false
  }
}
