'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Pencil, Trash2, RotateCcw, Loader2 } from 'lucide-react'

interface DomainRateLimit {
  id: string
  domain: string
  maxConcurrent: number
  rps: number
  description: string | null
}

interface CircuitBreakerConfig {
  failThreshold: number
  openDuration: number
  maxBackoff: number
  initialBackoff: number
}

export default function SettingsPage() {
  // 域名限速状态
  const [limits, setLimits] = useState<DomainRateLimit[]>([])
  const [limitsLoading, setLimitsLoading] = useState(true)
  const [editingLimit, setEditingLimit] = useState<DomainRateLimit | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletingLimit, setDeletingLimit] = useState<DomainRateLimit | null>(null)
  const [isResetLimitsDialogOpen, setIsResetLimitsDialogOpen] = useState(false)

  // 熔断配置状态
  const [circuitBreaker, setCircuitBreaker] = useState<CircuitBreakerConfig>({
    failThreshold: 5,
    openDuration: 300,
    maxBackoff: 60,
    initialBackoff: 1
  })
  const [cbLoading, setCbLoading] = useState(true)
  const [cbSaving, setCbSaving] = useState(false)
  const [isResetCbDialogOpen, setIsResetCbDialogOpen] = useState(false)

  // 表单状态
  const [formData, setFormData] = useState({
    domain: '',
    maxConcurrent: 10,
    rps: 10,
    description: ''
  })

  // 加载域名限速配置
  const loadLimits = async () => {
    setLimitsLoading(true)
    try {
      const res = await fetch('/api/admin/rate-limits')
      const data = await res.json()
      setLimits(data.limits || [])
    } catch (error) {
      console.error('加载域名限速配置失败:', error)
    } finally {
      setLimitsLoading(false)
    }
  }

  // 加载熔断配置
  const loadCircuitBreaker = async () => {
    setCbLoading(true)
    try {
      const res = await fetch('/api/admin/circuit-breaker')
      const data = await res.json()
      setCircuitBreaker(data.config)
    } catch (error) {
      console.error('加载熔断配置失败:', error)
    } finally {
      setCbLoading(false)
    }
  }

  useEffect(() => {
    loadLimits()
    loadCircuitBreaker()
  }, [])

  // 添加域名限速
  const handleAddLimit = async () => {
    try {
      const res = await fetch('/api/admin/rate-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (res.ok) {
        setIsAddDialogOpen(false)
        setFormData({ domain: '', maxConcurrent: 10, rps: 10, description: '' })
        loadLimits()
      } else {
        const data = await res.json()
        alert(data.error || '添加失败')
      }
    } catch (error) {
      console.error('添加域名限速失败:', error)
    }
  }

  // 更新域名限速
  const handleUpdateLimit = async () => {
    if (!editingLimit) return

    try {
      const res = await fetch('/api/admin/rate-limits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingLimit.id,
          maxConcurrent: formData.maxConcurrent,
          rps: formData.rps,
          description: formData.description
        })
      })

      if (res.ok) {
        setEditingLimit(null)
        loadLimits()
      } else {
        const data = await res.json()
        alert(data.error || '更新失败')
      }
    } catch (error) {
      console.error('更新域名限速失败:', error)
    }
  }

  // 删除域名限速
  const handleDeleteLimit = async () => {
    if (!deletingLimit) return

    try {
      const res = await fetch(`/api/admin/rate-limits?id=${deletingLimit.id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        setIsDeleteDialogOpen(false)
        setDeletingLimit(null)
        loadLimits()
      } else {
        const data = await res.json()
        alert(data.error || '删除失败')
      }
    } catch (error) {
      console.error('删除域名限速失败:', error)
    }
  }

  // 恢复默认域名限速
  const handleResetLimits = async () => {
    try {
      const res = await fetch('/api/admin/rate-limits', {
        method: 'PATCH'
      })

      if (res.ok) {
        setIsResetLimitsDialogOpen(false)
        loadLimits()
      }
    } catch (error) {
      console.error('恢复默认配置失败:', error)
    }
  }

  // 保存熔断配置
  const handleSaveCircuitBreaker = async () => {
    setCbSaving(true)
    try {
      const res = await fetch('/api/admin/circuit-breaker', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(circuitBreaker)
      })

      if (res.ok) {
        alert('保存成功')
      } else {
        const data = await res.json()
        alert(data.error || '保存失败')
      }
    } catch (error) {
      console.error('保存熔断配置失败:', error)
    } finally {
      setCbSaving(false)
    }
  }

  // 恢复默认熔断配置
  const handleResetCircuitBreaker = async () => {
    try {
      const res = await fetch('/api/admin/circuit-breaker', {
        method: 'PATCH'
      })

      if (res.ok) {
        setIsResetCbDialogOpen(false)
        loadCircuitBreaker()
      }
    } catch (error) {
      console.error('恢复默认配置失败:', error)
    }
  }

  // 打开编辑弹窗
  const openEditDialog = (limit: DomainRateLimit) => {
    setEditingLimit(limit)
    setFormData({
      domain: limit.domain,
      maxConcurrent: limit.maxConcurrent,
      rps: limit.rps,
      description: limit.description || ''
    })
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">系统设置</h1>
        <p className="text-muted-foreground">配置抓取系统的域名限速和熔断策略</p>
      </div>

      <Tabs defaultValue="rate-limits">
        <TabsList className="mb-4">
          <TabsTrigger value="rate-limits">域名限速配置</TabsTrigger>
          <TabsTrigger value="circuit-breaker">熔断配置</TabsTrigger>
        </TabsList>

        {/* 域名限速配置 */}
        <TabsContent value="rate-limits">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>域名限速配置</CardTitle>
                  <CardDescription>控制每个域名的请求频率，防止被目标网站封禁</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsResetLimitsDialogOpen(true)}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    恢复默认
                  </Button>
                  <Button onClick={() => {
                    setFormData({ domain: '', maxConcurrent: 10, rps: 10, description: '' })
                    setIsAddDialogOpen(true)
                  }}>
                    <Plus className="mr-2 h-4 w-4" />
                    添加域名
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {limitsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>域名</TableHead>
                      <TableHead>最大并发</TableHead>
                      <TableHead>RPS (每秒请求)</TableHead>
                      <TableHead>备注</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {limits.map((limit) => (
                      <TableRow key={limit.id}>
                        <TableCell className="font-mono">
                          {limit.domain === '*' ? '* (默认)' : limit.domain}
                        </TableCell>
                        <TableCell>{limit.maxConcurrent}</TableCell>
                        <TableCell>{limit.rps}</TableCell>
                        <TableCell className="text-muted-foreground">{limit.description}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(limit)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {limit.domain !== '*' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeletingLimit(limit)
                                setIsDeleteDialogOpen(true)
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 熔断配置 */}
        <TabsContent value="circuit-breaker">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>熔断配置</CardTitle>
                  <CardDescription>当域名连续失败时自动熔断，保护系统资源</CardDescription>
                </div>
                <Button variant="outline" onClick={() => setIsResetCbDialogOpen(true)}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  恢复默认
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {cbLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="grid gap-6 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="failThreshold">失败阈值（次数）</Label>
                    <Input
                      id="failThreshold"
                      type="number"
                      min={1}
                      max={100}
                      value={circuitBreaker.failThreshold}
                      onChange={(e) => setCircuitBreaker({
                        ...circuitBreaker,
                        failThreshold: parseInt(e.target.value) || 5
                      })}
                    />
                    <p className="text-sm text-muted-foreground">连续失败多少次后触发熔断</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="openDuration">熔断时间（秒）</Label>
                    <Input
                      id="openDuration"
                      type="number"
                      min={10}
                      max={3600}
                      value={circuitBreaker.openDuration}
                      onChange={(e) => setCircuitBreaker({
                        ...circuitBreaker,
                        openDuration: parseInt(e.target.value) || 300
                      })}
                    />
                    <p className="text-sm text-muted-foreground">熔断后暂停请求的时间</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxBackoff">最大退避时间（秒）</Label>
                    <Input
                      id="maxBackoff"
                      type="number"
                      min={1}
                      max={300}
                      value={circuitBreaker.maxBackoff}
                      onChange={(e) => setCircuitBreaker({
                        ...circuitBreaker,
                        maxBackoff: parseInt(e.target.value) || 60
                      })}
                    />
                    <p className="text-sm text-muted-foreground">指数退避的最大等待时间</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="initialBackoff">初始退避时间（秒）</Label>
                    <Input
                      id="initialBackoff"
                      type="number"
                      min={1}
                      max={60}
                      value={circuitBreaker.initialBackoff}
                      onChange={(e) => setCircuitBreaker({
                        ...circuitBreaker,
                        initialBackoff: parseInt(e.target.value) || 1
                      })}
                    />
                    <p className="text-sm text-muted-foreground">第一次失败后的等待时间</p>
                  </div>

                  <Button onClick={handleSaveCircuitBreaker} disabled={cbSaving}>
                    {cbSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    保存配置
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 添加域名弹窗 */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加域名限速配置</DialogTitle>
            <DialogDescription>为特定域名设置请求限制</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="domain">域名</Label>
              <Input
                id="domain"
                placeholder="example.com"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxConcurrent">最大并发</Label>
                <Input
                  id="maxConcurrent"
                  type="number"
                  min={1}
                  value={formData.maxConcurrent}
                  onChange={(e) => setFormData({ ...formData, maxConcurrent: parseInt(e.target.value) || 10 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rps">RPS</Label>
                <Input
                  id="rps"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={formData.rps}
                  onChange={(e) => setFormData({ ...formData, rps: parseFloat(e.target.value) || 10 })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">备注</Label>
              <Input
                id="description"
                placeholder="可选"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>取消</Button>
            <Button onClick={handleAddLimit}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑域名弹窗 */}
      <Dialog open={!!editingLimit} onOpenChange={() => setEditingLimit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑域名限速配置</DialogTitle>
            <DialogDescription>域名: {editingLimit?.domain}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-maxConcurrent">最大并发</Label>
                <Input
                  id="edit-maxConcurrent"
                  type="number"
                  min={1}
                  value={formData.maxConcurrent}
                  onChange={(e) => setFormData({ ...formData, maxConcurrent: parseInt(e.target.value) || 10 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rps">RPS</Label>
                <Input
                  id="edit-rps"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={formData.rps}
                  onChange={(e) => setFormData({ ...formData, rps: parseFloat(e.target.value) || 10 })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">备注</Label>
              <Input
                id="edit-description"
                placeholder="可选"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLimit(null)}>取消</Button>
            <Button onClick={handleUpdateLimit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除域名 "{deletingLimit?.domain}" 的限速配置吗？删除后将使用默认配置。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLimit}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 恢复默认域名限速确认 */}
      <AlertDialog open={isResetLimitsDialogOpen} onOpenChange={setIsResetLimitsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>恢复默认配置</AlertDialogTitle>
            <AlertDialogDescription>
              确定要恢复所有域名限速配置为默认值吗？此操作将删除所有自定义配置。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetLimits}>恢复默认</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 恢复默认熔断配置确认 */}
      <AlertDialog open={isResetCbDialogOpen} onOpenChange={setIsResetCbDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>恢复默认配置</AlertDialogTitle>
            <AlertDialogDescription>
              确定要恢复熔断配置为默认值吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetCircuitBreaker}>恢复默认</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
