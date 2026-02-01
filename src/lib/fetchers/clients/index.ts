/**
 * 远程服务客户端模块
 *
 * 导出所有远程服务客户端
 */

// Browserless 动态渲染客户端
export {
  renderPage,
  renderWithScroll,
  fetchFullTextWithBrowserless,
  checkBrowserlessHealth,
  type BrowserlessConfig,
  type RenderResult,
  type BrowserlessFullTextResult
} from './browserless'

// 抓取策略选择器
export {
  matchDomainRule,
  needsBrowserless,
  needsScroll,
  getRecommendedStrategy,
  isSpaShell,
  hasEnoughContent,
  shouldFallbackToBrowserless,
  getDomainHeaders,
  addDomainRules,
  getAllDomainRules,
  type FetchStrategy,
  type DomainRule
} from './strategy'

// 统一抓取管道
export {
  fetchWithPipeline,
  fetchBatch,
  resetBrowserlessCache,
  type PipelineConfig,
  type PipelineResult
} from './pipeline'
