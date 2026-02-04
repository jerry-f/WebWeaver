/**
 * 信息源抓取入口
 *
 * 重构后的架构：
 * - Web 进程只负责入队，立即返回 jobId
 * - 实际抓取工作由 SourceFetchWorker 异步处理
 * - 通过 Redis Pub/Sub + SSE 通知前端进度
 */

import { prisma } from '../prisma'
import { addSourceFetchJob } from '../queue/queues'
import { CredentialManager } from '../auth/credential-manager'
import { getUnifiedFetcher } from './unified-fetcher'

// 凭证管理器单例
const credentialManager = new CredentialManager()

/**
 * 抓取单个信息源
 *
 * 将抓取任务推送到队列，由 Worker 异步处理
 *
 * @param sourceId - 信息源 ID
 * @param options - 选项
 * @returns 任务 ID，用于前端订阅进度
 */
export async function fetchSource(
  sourceId: string,
  options: { triggeredBy?: 'manual' | 'scheduled'; force?: boolean } = {}
): Promise<{ jobId: string }> {
  // 验证源存在
  const source = await prisma.source.findUnique({ where: { id: sourceId } })
  if (!source) {
    throw new Error('Source not found')
  }

  // 生成任务 ID
  const jobId = `sf_${sourceId}_${Date.now()}`

  // 推送到队列
  await addSourceFetchJob({
    jobId,
    sourceId,
    triggeredBy: options.triggeredBy || 'manual',
    force: options.force
  })

  console.log(`[fetchSource] ${source.name}: 任务已入队 (${jobId})`)

  return { jobId }
}

/**
 * 抓取所有已启用的信息源
 *
 * 批量将抓取任务推送到队列
 *
 * @returns 所有任务 ID
 */
export async function fetchAllSources(): Promise<{ jobIds: string[] }> {
  const sources = await prisma.source.findMany({ where: { enabled: true } })

  console.log(`[fetchAllSources] 开始入队 ${sources.length} 个信息源`)

  const jobIds: string[] = []

  for (const source of sources) {
    try {
      const { jobId } = await fetchSource(source.id, { triggeredBy: 'scheduled' })
      jobIds.push(jobId)
    } catch (error) {
      console.error(`[fetchAllSources] ${source.name} 入队失败:`, error)
    }
  }

  console.log(`[fetchAllSources] 完成入队 ${jobIds.length} 个任务`)

  return { jobIds }
}

/**
 * 检查凭证状态
 *
 * @returns 凭证状态报告
 */
export function getCredentialStatus(): { domain: string; enabled: boolean; hasCredential: boolean }[] {
  const allCredentials = credentialManager.getAllCredentials()
  return allCredentials.map(cred => ({
    domain: cred.domain,
    enabled: cred.enabled,
    hasCredential: cred.cookieLength > 0
  }))
}

/**
 * 重新加载凭证配置
 */
export function reloadCredentials(): void {
  credentialManager.reload()
  getUnifiedFetcher().reloadCredentials()
}
