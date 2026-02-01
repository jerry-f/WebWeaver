/**
 * 站点登录配置
 *
 * 预配置常见站点的登录选择器
 */

import type { LoginConfig } from './auto-login'

/**
 * 站点登录配置映射
 */
export const SITE_LOGIN_CONFIGS: Record<string, LoginConfig> = {
  'medium.com': {
    loginUrl: 'https://medium.com/m/signin',
    selectors: {
      username: 'input[name="email"]',
      password: 'input[name="password"]',
      submit: 'button[type="submit"]',
      successIndicator: '[data-testid="headerAvatar"]'
    },
    postLoginDelay: 2000
  },

  'zhihu.com': {
    loginUrl: 'https://www.zhihu.com/signin',
    selectors: {
      username: 'input[name="username"]',
      password: 'input[name="password"]',
      submit: 'button[type="submit"]',
      successIndicator: '.AppHeader-profile'
    }
  },

  'juejin.cn': {
    loginUrl: 'https://juejin.cn/login',
    selectors: {
      username: 'input[name="loginPhoneOrEmail"]',
      password: 'input[name="loginPassword"]',
      submit: 'button.login-btn',
      successIndicator: '.avatar-wrapper'
    }
  },

  'segmentfault.com': {
    loginUrl: 'https://segmentfault.com/user/login',
    selectors: {
      username: 'input[name="username"]',
      password: 'input[name="password"]',
      submit: 'button[type="submit"]',
      successIndicator: '.user-avatar'
    }
  },

  'infoq.cn': {
    loginUrl: 'https://www.infoq.cn/login',
    selectors: {
      username: 'input[placeholder*="手机"]',
      password: 'input[type="password"]',
      submit: 'button.login-btn',
      successIndicator: '.user-info'
    }
  }
}

/**
 * 获取站点登录配置
 *
 * @param domain - 域名
 * @returns 登录配置或 undefined
 */
export function getSiteLoginConfig(domain: string): LoginConfig | undefined {
  // 尝试精确匹配
  if (SITE_LOGIN_CONFIGS[domain]) {
    return SITE_LOGIN_CONFIGS[domain]
  }

  // 尝试匹配主域名（去除 www.）
  const mainDomain = domain.replace(/^www\./, '')
  if (SITE_LOGIN_CONFIGS[mainDomain]) {
    return SITE_LOGIN_CONFIGS[mainDomain]
  }

  return undefined
}

/**
 * 检查域名是否有预配置的登录配置
 *
 * @param domain - 域名
 * @returns 是否有配置
 */
export function hasSiteLoginConfig(domain: string): boolean {
  return getSiteLoginConfig(domain) !== undefined
}

/**
 * 获取所有支持的站点域名
 *
 * @returns 域名列表
 */
export function getSupportedDomains(): string[] {
  return Object.keys(SITE_LOGIN_CONFIGS)
}
