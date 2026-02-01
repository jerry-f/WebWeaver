'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Play,
  Pause,
  Plus,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react'

interface TaskLog {
  id: string
  status: string
  message: string | null
  duration: number | null
  createdAt: string
}

interface Task {
  id: string
  name: string
  type: string
  schedule: string
  enabled: boolean
  lastRun: string | null
  nextRun: string | null
  lastStatus: string | null
  lastError: string | null
  logs: TaskLog[]
}

const taskTypes = [
  { value: 'FETCH', label: '抓取文章', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'SUMMARIZE', label: 'AI 摘要', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  { value: 'PUSH', label: '推送通知', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'CLEANUP', label: '清理数据', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
]

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newTask, setNewTask] = useState({ name: '', type: 'FETCH', schedule: '0 * * * *' })

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tasks')
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else if (data.tasks) {
        setTasks(data.tasks)
      }
    } catch (err) {
      console.error('获取任务失败:', err)
      setError('获取任务失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [])

  const handleToggleEnabled = async (taskId: string, enabled: boolean) => {
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, enabled: !enabled })
    })
    fetchTasks()
  }

  const handleDelete = async (taskId: string) => {
    if (!confirm('确定要删除此任务吗？')) return
    await fetch(`/api/tasks?taskId=${taskId}`, { method: 'DELETE' })
    fetchTasks()
  }

  const handleAddTask = async () => {
    if (!newTask.name || !newTask.schedule) return
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask)
    })
    setShowAddDialog(false)
    setNewTask({ name: '', type: 'FETCH', schedule: '0 * * * *' })
    fetchTasks()
  }

  const formatDate = (date: string | null) => {
    if (!date) return '-'
    return new Date(date).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTypeInfo = (type: string) => {
    return taskTypes.find(t => t.value === type) || { label: type, color: 'bg-gray-100 text-gray-800' }
  }

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">任务管理</h1>
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            {error}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">任务管理</h1>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          新建任务
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {tasks.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center text-gray-500">
              还没有任何任务，点击"新建任务"创建
            </CardContent>
          </Card>
        ) : (
          tasks.map((task) => {
            const typeInfo = getTypeInfo(task.type)
            return (
              <Card key={task.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {getStatusIcon(task.lastStatus)}
                        {task.name}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                        <Badge variant={task.enabled ? 'default' : 'secondary'}>
                          {task.enabled ? '启用' : '禁用'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleEnabled(task.id, task.enabled)}
                        title={task.enabled ? '禁用' : '启用'}
                      >
                        {task.enabled ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(task.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>调度</span>
                      <code className="bg-muted px-2 py-0.5 rounded">{task.schedule}</code>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>上次运行</span>
                      <span>{formatDate(task.lastRun)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>下次运行</span>
                      <span>{formatDate(task.nextRun)}</span>
                    </div>
                    {task.lastError && (
                      <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-xs">
                        {task.lastError}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* 新建任务对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建任务</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">任务名称</label>
              <Input
                value={newTask.name}
                onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
                placeholder="例如：每小时抓取新闻"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">任务类型</label>
              <select
                value={newTask.type}
                onChange={(e) => setNewTask({ ...newTask, type: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-input rounded-md"
              >
                {taskTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Cron 表达式</label>
              <Input
                value={newTask.schedule}
                onChange={(e) => setNewTask({ ...newTask, schedule: e.target.value })}
                placeholder="0 * * * * (每小时)"
              />
              <p className="text-xs text-muted-foreground mt-1">
                示例: 0 * * * * (每小时), 0 8 * * * (每天8点)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button onClick={handleAddTask}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
