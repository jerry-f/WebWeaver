'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface Source {
  id: string
  name: string
  type: string
  url: string
  subscribed: boolean
  _count: {
    articles: number
    subscriptions: number
  }
}

interface Subscription {
  id: string
  sourceId: string
  createdAt: string
  source: {
    id: string
    name: string
    type: string
    url: string
    _count: { articles: number }
  }
}

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [exploreSources, setExploreSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'subscribed' | 'explore'>('subscribed')

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch('/api/subscriptions')
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setSubscriptions(data.subscriptions || [])
      }
    } catch (err) {
      console.error('获取订阅失败:', err)
      setError('获取订阅失败')
    }
  }

  const fetchExploreSources = async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      const res = await fetch(`/api/sources/explore?${params}`)
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setExploreSources(data.sources || [])
      }
    } catch (err) {
      console.error('获取源失败:', err)
    }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchSubscriptions(), fetchExploreSources()]).finally(() => {
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (activeTab === 'explore') {
      fetchExploreSources()
    }
  }, [search, activeTab])

  const handleSubscribe = async (sourceId: string) => {
    await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId })
    })
    await Promise.all([fetchSubscriptions(), fetchExploreSources()])
  }

  const handleUnsubscribe = async (subscriptionId: string) => {
    await fetch(`/api/subscriptions/${subscriptionId}`, { method: 'DELETE' })
    await Promise.all([fetchSubscriptions(), fetchExploreSources()])
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
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
        <h1 className="text-2xl font-bold">订阅管理</h1>
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
        <h1 className="text-2xl font-bold">订阅管理</h1>
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'subscribed' ? 'default' : 'outline'}
            onClick={() => setActiveTab('subscribed')}
          >
            我的订阅 ({subscriptions.length})
          </Button>
          <Button
            variant={activeTab === 'explore' ? 'default' : 'outline'}
            onClick={() => setActiveTab('explore')}
          >
            发现源
          </Button>
        </div>
      </div>

      {activeTab === 'explore' && (
        <Input
          placeholder="搜索源..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      )}

      {activeTab === 'subscribed' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {subscriptions.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="py-8 text-center text-gray-500">
                还没有订阅任何源，去"发现源"看看吧
              </CardContent>
            </Card>
          ) : (
            subscriptions.map(sub => (
              <Card key={sub.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{sub.source.name}</CardTitle>
                    <Badge variant="secondary">{sub.source.type}</Badge>
                  </div>
                  <CardDescription className="truncate">
                    {sub.source.url}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {sub.source._count.articles} 篇文章
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleUnsubscribe(sub.id)}
                    >
                      取消订阅
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exploreSources.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="py-8 text-center text-gray-500">
                没有找到可订阅的源
              </CardContent>
            </Card>
          ) : (
            exploreSources.map(source => (
              <Card key={source.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{source.name}</CardTitle>
                    <Badge variant="secondary">{source.type}</Badge>
                  </div>
                  <CardDescription className="truncate">
                    {source.url}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {source._count.articles} 篇文章 · {source._count.subscriptions} 人订阅
                    </span>
                    {source.subscribed ? (
                      <Badge>已订阅</Badge>
                    ) : (
                      <Button size="sm" onClick={() => handleSubscribe(source.id)}>
                        订阅
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}
