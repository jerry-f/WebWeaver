/**
 * 认证模块
 *
 * 导出所有认证相关功能
 */

// 凭证加密
export {
  encryptCredential,
  decryptCredential,
  isEncrypted
} from './credential-crypto'

// 自动登录
export {
  autoLogin,
  validateCookies,
  type LoginConfig,
  type LoginResult
} from './auto-login'

// 站点配置
export {
  SITE_LOGIN_CONFIGS,
  getSiteLoginConfig,
  hasSiteLoginConfig,
  getSupportedDomains
} from './site-configs'

// 凭证管理器（文件存储）
export {
  CredentialManager,
  getCredentialManager,
  getCookieForUrl,
  requiresAuth
} from './credential-manager'

// 凭证状态检测
export {
  CredentialChecker,
  getCredentialChecker,
  checkAllCredentials,
  type CredentialStatus,
  type CredentialCheckResult
} from './credential-checker'
