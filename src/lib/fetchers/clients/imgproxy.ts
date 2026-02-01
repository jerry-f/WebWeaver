/**
 * imgproxy 客户端
 *
 * 生成 imgproxy 签名 URL，用于图片代理和处理
 * 支持：防盗链绕过、格式转换（WebP/AVIF）、缩放、裁剪
 */

import crypto from 'crypto'

/**
 * imgproxy 配置
 */
export interface ImgproxyConfig {
  /** imgproxy 服务地址 */
  endpoint: string
  /** 签名密钥（hex 编码） */
  key: string
  /** 签名盐值（hex 编码） */
  salt: string
  /** 是否启用签名 */
  enableSignature: boolean
}

/**
 * 图片处理选项
 */
export interface ImageOptions {
  /** 宽度 */
  width?: number
  /** 高度 */
  height?: number
  /** 缩放类型：fit, fill, crop */
  resizeType?: 'fit' | 'fill' | 'crop'
  /** 质量 (1-100) */
  quality?: number
  /** 输出格式 */
  format?: 'webp' | 'avif' | 'jpg' | 'png'
  /** 是否模糊 */
  blur?: number
  /** 是否锐化 */
  sharpen?: number
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ImgproxyConfig = {
  endpoint: process.env.IMGPROXY_URL || 'http://localhost:8889',
  key: process.env.IMGPROXY_KEY || '736563726574', // "secret" in hex
  salt: process.env.IMGPROXY_SALT || '73616c74',   // "salt" in hex
  enableSignature: process.env.NODE_ENV === 'production'
}

/**
 * imgproxy 客户端
 */
export class ImgproxyClient {
  private config: ImgproxyConfig

  constructor(config: Partial<ImgproxyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 生成 imgproxy URL
   *
   * @param sourceUrl - 原始图片 URL
   * @param options - 处理选项
   * @returns imgproxy URL
   */
  generateUrl(sourceUrl: string, options: ImageOptions = {}): string {
    // 构建处理参数路径
    const processingPath = this.buildProcessingPath(options)

    // Base64 编码源 URL
    const encodedUrl = this.encodeUrl(sourceUrl)

    // 构建完整路径
    const path = `${processingPath}/${encodedUrl}`

    // 生成签名
    if (this.config.enableSignature) {
      const signature = this.sign(path)
      return `${this.config.endpoint}/${signature}${path}`
    }

    // 不签名（开发环境）
    return `${this.config.endpoint}/insecure${path}`
  }

  /**
   * 生成简单代理 URL（无处理）
   */
  proxyUrl(sourceUrl: string): string {
    return this.generateUrl(sourceUrl)
  }

  /**
   * 生成缩略图 URL
   */
  thumbnailUrl(sourceUrl: string, width = 300, height = 200): string {
    return this.generateUrl(sourceUrl, {
      width,
      height,
      resizeType: 'fill',
      quality: 75,
      format: 'webp'
    })
  }

  /**
   * 生成响应式图片 URL
   */
  responsiveUrl(sourceUrl: string, width: number): string {
    return this.generateUrl(sourceUrl, {
      width,
      resizeType: 'fit',
      format: 'webp'
    })
  }

  /**
   * 构建处理参数路径
   */
  private buildProcessingPath(options: ImageOptions): string {
    const parts: string[] = []

    // 缩放类型
    if (options.resizeType) {
      parts.push(`rt:${options.resizeType}`)
    }

    // 尺寸
    if (options.width || options.height) {
      const w = options.width || 0
      const h = options.height || 0
      parts.push(`s:${w}:${h}`)
    }

    // 质量
    if (options.quality) {
      parts.push(`q:${options.quality}`)
    }

    // 模糊
    if (options.blur) {
      parts.push(`bl:${options.blur}`)
    }

    // 锐化
    if (options.sharpen) {
      parts.push(`sh:${options.sharpen}`)
    }

    // 格式
    if (options.format) {
      parts.push(`f:${options.format}`)
    }

    return parts.length > 0 ? `/${parts.join('/')}` : ''
  }

  /**
   * Base64 URL 安全编码
   */
  private encodeUrl(url: string): string {
    return Buffer.from(url)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }

  /**
   * 生成 HMAC-SHA256 签名
   */
  private sign(path: string): string {
    const keyBin = Buffer.from(this.config.key, 'hex')
    const saltBin = Buffer.from(this.config.salt, 'hex')

    const hmac = crypto.createHmac('sha256', keyBin)
    hmac.update(saltBin)
    hmac.update(path)

    return hmac.digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }

  /**
   * 检查服务是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/health`, {
        signal: AbortSignal.timeout(5000)
      })
      return response.ok
    } catch {
      return false
    }
  }
}

/**
 * 默认客户端实例
 */
let defaultClient: ImgproxyClient | null = null

/**
 * 获取默认客户端
 */
export function getImgproxyClient(): ImgproxyClient {
  if (!defaultClient) {
    defaultClient = new ImgproxyClient()
  }
  return defaultClient
}

/**
 * 生成图片代理 URL（便捷函数）
 */
export function imgproxyUrl(sourceUrl: string, options?: ImageOptions): string {
  return getImgproxyClient().generateUrl(sourceUrl, options)
}

/**
 * 生成缩略图 URL（便捷函数）
 */
export function thumbnailUrl(sourceUrl: string, width = 300, height = 200): string {
  return getImgproxyClient().thumbnailUrl(sourceUrl, width, height)
}
