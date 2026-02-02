/**
 * 任务队列模块
 *
 * 导出所有队列相关功能
 */

// Redis 连接
export {
  createRedisConnection,
  getRedisConnection,
  closeRedisConnection,
  type RedisConfig
} from './redis'

// 队列
export {
  QUEUE_NAMES,
  getFetchQueue,
  getSummaryQueue,
  getCredentialQueue,
  addFetchJob,
  addFetchJobs,
  addSummaryJob,
  getQueueStats,
  cleanQueues,
  closeQueues,
  type FetchJobData,
  type SummaryJobData,
  type CredentialJobData
} from './queues'

// Workers
export {
  startFetchWorker,
  startSummaryWorker,
  startCredentialWorker,
  startAllWorkers,
  stopAllWorkers,
  type WorkerConfig
} from './workers'
