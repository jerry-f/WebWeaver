'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  RefreshCw,
  Play,
  Pause,
  Trash2,
  RotateCcw,
  FileText,
  Rss,
  Sparkles,
  Key,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

// 队列信息类型
interface QueueInfo {
  key: string
  name: string
  description: string
  icon: string
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: number
  isPaused: boolean
}

// 任务类型
interface JobInfo {
  id: string
  name: string
  data: Record<string, unknown>
  status: string
  attemptsMade: number
  failedReason?: string
  processedOn?: number
  finishedOn?: number
  timestamp: number
}

// 任务详情类型
interface JobDetail extends JobInfo {
  attemptsTotal: number
  stacktrace?: string[]
  logs?: string[]
  opts?: {
    priority?: number
    delay?: number
    attempts?: number
  }
}

// 历史统计类型
interface HistoryPoint {
  hour: string
  completed: number
  failed: number
  avgDuration: number
}

interface HistorySummary {
  totalCompleted: number
  totalFailed: number
  avgDuration: number
}

// 任务进度类型
interface JobProgress {
  jobId: string
  sourceId: string
  type: 'source_fetch' | 'crawl_discovery' | 'article_fetch'
  status: 'started' | 'progress' | 'completed' | 'failed'
  progress?: {
    current: number
    total: number
    added?: number
    queued?: number
  }
  error?: string
  timestamp: number
}

// 图标映射
const iconMap: Record<string, React.ReactNode> = {
  Rss: <Rss className="h-5 w-5" />,
  FileText: <FileText className="h-5 w-5" />,
  Sparkles: <Sparkles className="h-5 w-5" />,
  Key: <Key className="h-5 w-5" />,
}

export default function QueuesPage() {
  const [queues, setQueues] = useState<QueueInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // 失败任务
  const [failedJobs, setFailedJobs] = useState<JobInfo[]>([])
  const [selectedQueue, setSelectedQueue] = useState<string>('fetch')
  const [expandedQueues, setExpandedQueues] = useState<Set<string>>(new Set(['fetch']))

  // 活跃任务（等待中 + 执行中）
  const [activeJobs, setActiveJobs] = useState<JobInfo[]>([])
  const [waitingJobs, setWaitingJobs] = useState<JobInfo[]>([])

  // 任务详情弹窗
  const [showJobDetail, setShowJobDetail] = useState(false)
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null)
  const [loadingJobDetail, setLoadingJobDetail] = useState(false)

  // 历史统计
  const [historySummary, setHistorySummary] = useState<HistorySummary | null>(null)

  // 实时任务进度
  const [jobProgress, setJobProgress] = useState<JobProgress[]>([])

  // 操作状态
  const [operating, setOperating] = useState<string | null>(null)

  // 获取队列状态
  const fetchQueues = useCallback(async () => {
    try {
      const res = await fetch('/api/queues')
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setQueues(data.queues)
        setLastUpdate(new Date())
        setError(null)
      }
    } catch (err) {
      console.error('获取队列状态失败:', err)
      setError('获取队列状态失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 获取失败任务
  const fetchFailedJobs = useCallback(async (queueKey: string) => {
    try {
      const res = await fetch(`/api/queues/${queueKey}/jobs?status=failed&limit=50`)
      const data = await res.json()
      if (!data.error) {
        setFailedJobs(data.jobs)
      }
    } catch (err) {
      console.error('获取失败任务失败:', err)
    }
  }, [])

  // 获取活跃任务（等待中 + 执行中）
  const fetchActiveJobs = useCallback(async () => {
    try {
      // 获取所有队列的活跃任务
      const allActive: JobInfo[] = []
      const allWaiting: JobInfo[] = []

      for (const queueKey of ['sourceFetch', 'fetch', 'summary', 'credential']) {
        const [activeRes, waitingRes] = await Promise.all([
          fetch(`/api/queues/${queueKey}/jobs?status=active&limit=10`),
          fetch(`/api/queues/${queueKey}/jobs?status=waiting&limit=10`)
        ])
        const activeData = await activeRes.json()
        const waitingData = await waitingRes.json()

        if (!activeData.error && activeData.jobs) {
          allActive.push(...activeData.jobs.map((j: JobInfo) => ({ ...j, queueKey })))
        }
        if (!waitingData.error && waitingData.jobs) {
          allWaiting.push(...waitingData.jobs.map((j: JobInfo) => ({ ...j, queueKey })))
        }
      }

      setActiveJobs(allActive)
      setWaitingJobs(allWaiting)
    } catch (err) {
      console.error('获取活跃任务失败:', err)
    }
  }, [])

  // 获取历史统计
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/queues/stats?hours=24')
      const data = await res.json()
      if (!data.error) {
        setHistorySummary(data.summary)
      }
    } catch (err) {
      console.error('获取历史统计失败:', err)
    }
  }, [])

  // 获取实时任务进度
  const fetchJobProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/queues/progress')
      const data = await res.json()
      if (!data.error) {
        setJobProgress(data.progress)
      }
    } catch (err) {
      console.error('获取任务进度失败:', err)
    }
  }, [])

  // 初始化和自动刷新
  useEffect(() => {
    fetchQueues()
    fetchHistory()
    fetchFailedJobs(selectedQueue)
    fetchActiveJobs()
    fetchJobProgress()

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchQueues()
        fetchFailedJobs(selectedQueue)
        fetchActiveJobs()
        fetchJobProgress()
      }, 3000) // 改为3秒，更快看到变化
      return () => clearInterval(interval)
    }
  }, [autoRefresh, selectedQueue, fetchQueues, fetchFailedJobs, fetchHistory, fetchActiveJobs, fetchJobProgress])

  // 队列操作
  const handleQueueAction = async (queueKey: string, action: 'pause' | 'resume' | 'clean') => {
    setOperating(`${queueKey}-${action}`)
    try {
      const res = await fetch('/api/queues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue: queueKey, action })
      })
      const data = await res.json()
      if (data.success) {
        fetchQueues()
      }
    } catch (err) {
      console.error('队列操作失败:', err)
    } finally {
      setOperating(null)
    }
  }

  // 任务操作
  const handleJobAction = async (queueKey: string, jobId: string, action: 'retry' | 'remove') => {
    setOperating(`${jobId}-${action}`)
    try {
      const res = await fetch(`/api/queues/${queueKey}/jobs/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      const data = await res.json()
      if (data.success) {
        fetchFailedJobs(queueKey)
        fetchQueues()
        if (showJobDetail) {
          setShowJobDetail(false)
          setJobDetail(null)
        }
      }
    } catch (err) {
      console.error('任务操作失败:', err)
    } finally {
      setOperating(null)
    }
  }

  // 批量重试
  const handleRetryAll = async (queueKey: string) => {
    setOperating(`${queueKey}-retryAll`)
    try {
      const res = await fetch(`/api/queues/${queueKey}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retryAll' })
      })
      const data = await res.json()
      if (data.success) {
        fetchFailedJobs(queueKey)
        fetchQueues()
      }
    } catch (err) {
      console.error('批量重试失败:', err)
    } finally {
      setOperating(null)
    }
  }

  // 查看任务详情
  const handleViewJobDetail = async (queueKey: string, jobId: string) => {
    setLoadingJobDetail(true)
    setShowJobDetail(true)
    try {
      const res = await fetch(`/api/queues/${queueKey}/jobs/${jobId}`)
      const data = await res.json()
      if (!data.error) {
        setJobDetail(data.job)
      }
    } catch (err) {
      console.error('获取任务详情失败:', err)
    } finally {
      setLoadingJobDetail(false)
    }
  }

  // 格式化时间
  const formatTime = (timestamp: number | undefined) => {
    if (!timestamp) return '-'
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  // 格式化相对时间
  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return `${Math.floor(diff / 86400000)} 天前`
  }

  // 格式化耗时
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  // 切换队列展开
  const toggleQueueExpand = (queueKey: string) => {
    const newExpanded = new Set(expandedQueues)
    if (newExpanded.has(queueKey)) {
      newExpanded.delete(queueKey)
    } else {
      newExpanded.add(queueKey)
      setSelectedQueue(queueKey)
      fetchFailedJobs(queueKey)
    }
    setExpandedQueues(newExpanded)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">队列监控</h1>
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
            {error}
          </CardContent>
        </Card>
      </div>
    )
  }

  // 计算总失败数
  const totalFailed = queues.reduce((sum, q) => sum + q.failed, 0)

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">队列监控</h1>
          {lastUpdate && (
            <p className="text-sm text-muted-foreground">
              最后更新: {lastUpdate.toLocaleTimeString('zh-CN')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchQueues()
              fetchFailedJobs(selectedQueue)
              fetchHistory()
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            刷新
          </Button>
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                自动刷新
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 mr-1" />
                已暂停
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 统计概览 */}
      {historySummary && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-around text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {historySummary.totalCompleted}
                </div>
                <div className="text-sm text-muted-foreground">24h 完成</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {historySummary.totalFailed}
                </div>
                <div className="text-sm text-muted-foreground">24h 失败</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {formatDuration(historySummary.avgDuration)}
                </div>
                <div className="text-sm text-muted-foreground">平均耗时</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">
                  {queues.reduce((sum, q) => sum + q.waiting + q.active, 0)}
                </div>
                <div className="text-sm text-muted-foreground">当前队列</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 队列卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {queues.map((queue) => (
          <Card key={queue.key} className={queue.isPaused ? 'opacity-60' : ''}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {iconMap[queue.icon]}
                  <CardTitle className="text-base">{queue.name}</CardTitle>
                </div>
                {queue.isPaused && (
                  <Badge variant="secondary">已暂停</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{queue.description}</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">等待中</span>
                  <span className="font-medium">{queue.waiting}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">执行中</span>
                  <span className="font-medium text-blue-600">{queue.active}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">已完成</span>
                  <span className="font-medium text-green-600">{queue.completed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">失败</span>
                  <span className={`font-medium ${queue.failed > 0 ? 'text-red-600' : ''}`}>
                    {queue.failed}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleQueueAction(queue.key, queue.isPaused ? 'resume' : 'pause')}
                  disabled={operating === `${queue.key}-pause` || operating === `${queue.key}-resume`}
                >
                  {queue.isPaused ? (
                    <><Play className="h-3 w-3 mr-1" />恢复</>
                  ) : (
                    <><Pause className="h-3 w-3 mr-1" />暂停</>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    if (confirm('确定要清空等待中的任务吗？')) {
                      handleQueueAction(queue.key, 'clean')
                    }
                  }}
                  disabled={operating === `${queue.key}-clean` || queue.waiting === 0}
                >
                  <Trash2 className="h-3 w-3 mr-1" />清空
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 实时任务进度 */}
      {jobProgress.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              任务进度
              <Badge variant="secondary">{jobProgress.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {jobProgress.map((progress) => (
                <div
                  key={progress.jobId}
                  className="px-4 py-3 bg-muted/50 rounded-lg border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {progress.type === 'source_fetch' && <Rss className="h-4 w-4 text-blue-500" />}
                      {progress.type === 'crawl_discovery' && <FileText className="h-4 w-4 text-orange-500" />}
                      {progress.type === 'article_fetch' && <FileText className="h-4 w-4 text-green-500" />}
                      <span className="text-sm font-medium">
                        {progress.type === 'source_fetch' && '源抓取'}
                        {progress.type === 'crawl_discovery' && '链接发现'}
                        {progress.type === 'article_fetch' && '文章抓取'}
                      </span>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {progress.jobId.slice(0, 16)}...
                      </code>
                    </div>
                    <Badge
                      variant={
                        progress.status === 'completed' ? 'default' :
                        progress.status === 'failed' ? 'destructive' :
                        'secondary'
                      }
                    >
                      {progress.status === 'started' && '开始'}
                      {progress.status === 'progress' && '进行中'}
                      {progress.status === 'completed' && '完成'}
                      {progress.status === 'failed' && '失败'}
                    </Badge>
                  </div>

                  {/* 进度条 */}
                  {progress.progress && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {progress.progress.current} / {progress.progress.total}
                          {progress.progress.added !== undefined && (
                            <span className="ml-2 text-green-600">
                              +{progress.progress.added} 新增
                            </span>
                          )}
                          {progress.progress.queued !== undefined && (
                            <span className="ml-2 text-blue-600">
                              {progress.progress.queued} 入队
                            </span>
                          )}
                        </span>
                        <span>
                          {progress.progress.total > 0
                            ? Math.round((progress.progress.current / progress.progress.total) * 100)
                            : 0}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{
                            width: `${progress.progress.total > 0
                              ? (progress.progress.current / progress.progress.total) * 100
                              : 0}%`
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 错误信息 */}
                  {progress.error && (
                    <p className="text-xs text-red-600 mt-2">
                      {progress.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 活跃任务区域 - 等待中 + 执行中 */}
      {(activeJobs.length > 0 || waitingJobs.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
              活跃任务
              <Badge variant="secondary">{activeJobs.length + waitingJobs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* 执行中的任务 */}
              {activeJobs.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-blue-600 mb-2 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    执行中 ({activeJobs.length})
                  </h4>
                  <div className="space-y-2">
                    {activeJobs.slice(0, 10).map((job) => (
                      <div key={job.id} className="flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2 min-w-0">
                          <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
                          <code className="text-xs font-mono truncate">{job.id}</code>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatRelativeTime(job.timestamp)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2"
                            onClick={() => handleViewJobDetail((job as JobInfo & { queueKey?: string }).queueKey || 'fetch', job.id)}
                          >
                            详情
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 等待中的任务 */}
              {waitingJobs.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-orange-600 mb-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    等待中 ({waitingJobs.length})
                  </h4>
                  <div className="space-y-2">
                    {waitingJobs.slice(0, 10).map((job) => (
                      <div key={job.id} className="flex items-center justify-between px-3 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                        <div className="flex items-center gap-2 min-w-0">
                          <Clock className="h-4 w-4 text-orange-500 flex-shrink-0" />
                          <code className="text-xs font-mono truncate">{job.id}</code>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatRelativeTime(job.timestamp)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2"
                            onClick={() => handleViewJobDetail((job as JobInfo & { queueKey?: string }).queueKey || 'fetch', job.id)}
                          >
                            详情
                          </Button>
                        </div>
                      </div>
                    ))}
                    {waitingJobs.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center">
                        还有 {waitingJobs.length - 10} 个任务等待中...
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 失败任务区域 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              失败任务
              {totalFailed > 0 && (
                <Badge variant="destructive">{totalFailed}</Badge>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {/* 队列选择 */}
          <div className="space-y-2">
            {queues.filter(q => q.failed > 0).map((queue) => (
              <div key={queue.key} className="border rounded-lg">
                <div
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 cursor-pointer"
                  onClick={() => toggleQueueExpand(queue.key)}
                >
                  <div className="flex items-center gap-2">
                    {iconMap[queue.icon]}
                    <span className="font-medium">{queue.name}</span>
                    <Badge variant="destructive" className="ml-2">{queue.failed}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRetryAll(queue.key)
                      }}
                      disabled={operating === `${queue.key}-retryAll`}
                    >
                      {operating === `${queue.key}-retryAll` ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3 mr-1" />
                      )}
                      全部重试
                    </Button>
                    {expandedQueues.has(queue.key) ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </div>

                {expandedQueues.has(queue.key) && selectedQueue === queue.key && (
                  <div className="border-t divide-y">
                    {failedJobs.length === 0 ? (
                      <div className="px-4 py-8 text-center text-muted-foreground">
                        <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                        暂无失败任务
                      </div>
                    ) : (
                      failedJobs.map((job) => (
                        <div key={job.id} className="px-4 py-3 hover:bg-muted/30">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
                                  {job.id}
                                </code>
                                <span className="text-xs text-muted-foreground">
                                  {formatRelativeTime(job.timestamp)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  · 重试 {job.attemptsMade} 次
                                </span>
                              </div>
                              {job.failedReason && (
                                <p className="text-sm text-red-600 mt-1 truncate">
                                  {job.failedReason}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1 ml-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewJobDetail(queue.key, job.id)}
                              >
                                详情
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleJobAction(queue.key, job.id, 'retry')}
                                disabled={operating === `${job.id}-retry`}
                              >
                                {operating === `${job.id}-retry` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleJobAction(queue.key, job.id, 'remove')}
                                disabled={operating === `${job.id}-remove`}
                              >
                                {operating === `${job.id}-remove` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}

            {queues.every(q => q.failed === 0) && (
              <div className="py-8 text-center text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                所有队列运行正常，暂无失败任务
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 任务详情弹窗 */}
      <Dialog open={showJobDetail} onOpenChange={setShowJobDetail}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              任务详情
              {jobDetail && (
                <code className="ml-2 text-sm font-mono bg-muted px-2 py-1 rounded">
                  {jobDetail.id}
                </code>
              )}
            </DialogTitle>
          </DialogHeader>

          {loadingJobDetail ? (
            <div className="py-8 text-center">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
            </div>
          ) : jobDetail ? (
            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">状态</span>
                  <div className="font-medium">
                    <Badge variant={jobDetail.status === 'failed' ? 'destructive' : 'default'}>
                      {jobDetail.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">重试次数</span>
                  <div className="font-medium">
                    {jobDetail.attemptsMade} / {jobDetail.attemptsTotal}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">创建时间</span>
                  <div className="font-medium">{formatTime(jobDetail.timestamp)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">处理时间</span>
                  <div className="font-medium">{formatTime(jobDetail.processedOn)}</div>
                </div>
              </div>

              {/* 任务数据 */}
              <div>
                <h4 className="text-sm font-medium mb-2">任务数据</h4>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                  {JSON.stringify(jobDetail.data, null, 2)}
                </pre>
              </div>

              {/* 错误信息 */}
              {jobDetail.failedReason && (
                <div>
                  <h4 className="text-sm font-medium mb-2 text-red-600">错误信息</h4>
                  <div className="text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                    <p className="text-red-600 dark:text-red-400">{jobDetail.failedReason}</p>
                    {jobDetail.stacktrace && jobDetail.stacktrace.length > 0 && (
                      <pre className="text-xs mt-2 text-red-500 dark:text-red-400 overflow-x-auto whitespace-pre-wrap">
                        {jobDetail.stacktrace.join('\n')}
                      </pre>
                    )}
                  </div>
                </div>
              )}

              {/* 日志 */}
              {jobDetail.logs && jobDetail.logs.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">执行日志</h4>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-40">
                    {jobDetail.logs.join('\n')}
                  </pre>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowJobDetail(false)}>
              关闭
            </Button>
            {jobDetail && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleJobAction(selectedQueue, jobDetail.id, 'retry')}
                  disabled={operating === `${jobDetail.id}-retry`}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  重试
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleJobAction(selectedQueue, jobDetail.id, 'remove')}
                  disabled={operating === `${jobDetail.id}-remove`}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  删除
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
