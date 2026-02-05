/**
 * 检查队列状态
 *
 * 用于调试 BullMQ 队列问题
 */

import { getSourceFetchQueue, getFetchQueue, getSummaryQueue, getCredentialQueue, QUEUE_NAMES } from '../src/lib/queue/queues'
import { closeRedisConnection } from '../src/lib/queue/redis'

async function checkQueues() {
  console.log('检查队列状态...\n')

  try {
    // 检查 SOURCE_FETCH 队列
    const sourceFetchQueue = getSourceFetchQueue()
    const sfCounts = await sourceFetchQueue.getJobCounts()
    console.log(`[${QUEUE_NAMES.SOURCE_FETCH}]第一层：源级别任务`)
    console.log(`  waiting: ${sfCounts.waiting}`)
    console.log(`  active: ${sfCounts.active}`)
    console.log(`  completed: ${sfCounts.completed}`)
    console.log(`  failed: ${sfCounts.failed}`)
    console.log(`  delayed: ${sfCounts.delayed}`)

    // 获取等待中的任务
    const waitingJobs = await sourceFetchQueue.getWaiting(0, 10)
    if (waitingJobs.length > 0) {
      console.log(`\n  等待中的任务:`)
      for (const job of waitingJobs) {
        console.log(`    - ${job.id}: ${JSON.stringify(job.data)}`)
      }
    }

    // 获取失败的任务
    const failedJobs = await sourceFetchQueue.getFailed(0, 10)
    if (failedJobs.length > 0) {
      console.log(`\n  失败的任务:`)
      for (const job of failedJobs) {
        console.log(`    - ${job.id}: ${job.failedReason}`)
      }
    }

    console.log('')

    // 检查 FETCH 队列
    const fetchQueue = getFetchQueue()
    const fCounts = await fetchQueue.getJobCounts()
    console.log(`[${QUEUE_NAMES.FETCH}]第二层：文章级别任务`)
    console.log(`  waiting: ${fCounts.waiting}`)
    console.log(`  active: ${fCounts.active}`)
    console.log(`  completed: ${fCounts.completed}`)
    console.log(`  failed: ${fCounts.failed}`)

    console.log('')

    // 检查 SUMMARY 队列
    const summaryQueue = getSummaryQueue()
    const sCounts = await summaryQueue.getJobCounts()
    console.log(`[${QUEUE_NAMES.SUMMARY}]第三层：辅助任务`)
    console.log(`  waiting: ${sCounts.waiting}`)
    console.log(`  active: ${sCounts.active}`)
    console.log(`  completed: ${sCounts.completed}`)
    console.log(`  failed: ${sCounts.failed}`)

    console.log('')

    // 检查 CREDENTIAL 队列
    const credentialQueue = getCredentialQueue()
    const cCounts = await credentialQueue.getJobCounts()
    console.log(`[${QUEUE_NAMES.CREDENTIAL}]凭证任务`)
    console.log(`  waiting: ${cCounts.waiting}`)
    console.log(`  active: ${cCounts.active}`)
    console.log(`  completed: ${cCounts.completed}`)
    console.log(`  failed: ${cCounts.failed}`)

  } catch (error) {
    console.error('检查失败:', error)
  } finally {
    await closeRedisConnection()
    process.exit(0)
  }
}

checkQueues()
