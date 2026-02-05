/**
 * Browserless 客户端 (Stealth 模式)
 *
 * 通过 Browserless 服务进行动态页面渲染
 * 用于处理需要 JavaScript 渲染的 SPA 页面
 *
 * 【重要】使用 /function API + Stealth 伪装
 * 解决反爬虫检测导致的超时和拿不到数据问题
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
  /** 是否启用 Stealth 模式（默认 true） */
  stealth?: boolean
  /** Cookie 字符串（用于认证） */
  cookie?: string
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
  endpoint: process.env.BROWSERLESS_URL || 'http://localhost:3300',
  timeout: 30000,
  waitForNetworkIdle: true,
  scroll: {
    enabled: false,
    maxScrolls: 3,
    scrollDelay: 1000
  },
  blockResources: ['font', 'media'],
  stealth: true
}

/**
 * Stealth 伪装脚本
 * 隐藏自动化特征，绕过反爬虫检测
 */
const STEALTH_SCRIPT = `
  // 1. 隐藏 webdriver 标志（最重要）
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
 * 通过 Browserless 渲染页面（使用 Stealth 模式）
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
    // 使用 HTTP 端点
    const httpEndpoint = cfg.endpoint
      .replace('ws://', 'http://')
      .replace('wss://', 'https://')

    const waitUntil = cfg.waitForNetworkIdle ? 'networkidle2' : 'domcontentloaded'
    const timeout = cfg.timeout || 30000

    // 构建 Stealth 模式的脚本
    const stealthSetup = cfg.stealth !== false ? `
      await page.evaluateOnNewDocument(function() {
        ${STEALTH_SCRIPT}
      });
      await page.setUserAgent('${DEFAULT_USER_AGENT}');
    ` : ''

    // 在 TypeScript 端提取域名（Browserless 环境没有 URL 对象）
    const domain = new URL(url).hostname

    // 构建 Cookie 注入脚本（在 goto 之前设置）
    const cookieSetup = cfg.cookie ? `
      // 解析并注入 Cookie
      if (context.cookie && context.domain) {
        var cookiePairs = context.cookie.split(';');
        var cookies = [];
        for (var i = 0; i < cookiePairs.length; i++) {
          var pair = cookiePairs[i].trim();
          var eqIndex = pair.indexOf('=');
          if (eqIndex > 0) {
            cookies.push({
              name: pair.substring(0, eqIndex).trim(),
              value: pair.substring(eqIndex + 1).trim(),
              domain: context.domain,
              path: '/'
            });
          }
        }
        if (cookies.length > 0) {
          await page.setCookie.apply(page, cookies);
        }
      }
    ` : ''

    const code = `
      module.exports = async function(args) {
        var page = args.page;
        var context = args.context;
        ${stealthSetup}
        ${cookieSetup}
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(context.url, { waitUntil: '${waitUntil}', timeout: ${timeout} });
        return { data: await page.content(), type: 'text/html' };
      };
    `

    const response = await fetch(`${httpEndpoint}/function`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, context: { url, domain, cookie: cfg.cookie } }),
      signal: AbortSignal.timeout(timeout + 5000)
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.log('Browserless render failed:',
        {
          url,
          status: response.status,
          statusText: response.statusText,
          errorBody
        }
      )
      console.error('Browserless render failed:', response.status, response.statusText)
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
    console.error('Browserless render error:', url, error)
    return null
  }
}

/**
 * 通过 Browserless 渲染并滚动加载页面（使用 Stealth 模式）
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

    const maxScrolls = cfg.scroll?.maxScrolls || 3
    const scrollDelay = cfg.scroll?.scrollDelay || 1000
    const timeout = cfg.timeout || 30000

    // 构建 Stealth 模式的脚本
    const stealthSetup = cfg.stealth !== false ? `
      await page.evaluateOnNewDocument(function() {
        ${STEALTH_SCRIPT}
      });
      await page.setUserAgent('${DEFAULT_USER_AGENT}');
    ` : ''

    // 在 TypeScript 端提取域名（Browserless 环境没有 URL 对象）
    const domain = new URL(url).hostname

    // 构建 Cookie 注入脚本（在 goto 之前设置）
    const cookieSetup = cfg.cookie ? `
      // 解析并注入 Cookie
      if (context.cookie && context.domain) {
        var cookiePairs = context.cookie.split(';');
        var cookies = [];
        for (var i = 0; i < cookiePairs.length; i++) {
          var pair = cookiePairs[i].trim();
          var eqIndex = pair.indexOf('=');
          if (eqIndex > 0) {
            cookies.push({
              name: pair.substring(0, eqIndex).trim(),
              value: pair.substring(eqIndex + 1).trim(),
              domain: context.domain,
              path: '/'
            });
          }
        }
        if (cookies.length > 0) {
          await page.setCookie.apply(page, cookies);
        }
      }
    ` : ''

    const code = `
      module.exports = async function(args) {
        var page = args.page;
        var context = args.context;
        var url = context.url;
        var maxScrolls = context.maxScrolls;
        var scrollDelay = context.scrollDelay;

        ${stealthSetup}
        ${cookieSetup}
        await page.setViewport({ width: 1280, height: 800 });

        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: ${timeout}
        });

        // 滚动加载
        for (var i = 0; i < maxScrolls; i++) {
          await page.evaluate(function() {
            window.scrollTo(0, document.body.scrollHeight);
          });
          await new Promise(function(r) { setTimeout(r, scrollDelay); });
        }

        // 回到顶部
        await page.evaluate(function() { window.scrollTo(0, 0); });

        return { data: await page.content(), type: 'text/html' };
      };
    `

    const totalTimeout = timeout + maxScrolls * scrollDelay + 5000

    const response = await fetch(`${httpEndpoint}/function`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        context: { url, domain, maxScrolls, scrollDelay, cookie: cfg.cookie }
      }),
      signal: AbortSignal.timeout(totalTimeout)
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
    // console.log('Browserless 渲染完成，开始正文提取:', url)
    // console.log('获取结果 html:', renderResult.html)
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
