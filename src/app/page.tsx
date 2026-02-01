'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArticleList } from '@/components/ArticleList'
import { ArticleView } from '@/components/ArticleView'
import { Sidebar } from '@/components/Sidebar'
import { AddSourceModal } from '@/components/AddSourceModal'

interface Source {
  id: string
  name: string
  type: string
  url: string
  enabled: boolean
  _count: { articles: number }
}

interface Article {
  id: string
  title: string
  content?: string
  url: string
  imageUrl?: string
  author?: string
  publishedAt?: string
  read: boolean
  starred: boolean
  source: { name: string }
}

function HomeContent() {
  const [sources, setSources] = useState<Source[]>([])
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread' | 'starred'>('all')
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const fetchSources = useCallback(async () => {
    const res = await fetch('/api/sources')
    const data = await res.json()
    setSources(data)
  }, [])
  
  useEffect(() => {
    const loadSources = async () => {
      const res = await fetch('/api/sources')
      const data = await res.json()
      setSources(data)
    }
    loadSources()
  }, [])
  
  // Restore selected article from URL on mount
  useEffect(() => {
    const articleId = searchParams.get('article')
    if (articleId && !selectedArticle) {
      // Fetch article data
      fetch(`/api/articles/${articleId}`)
        .then(res => res.ok ? res.json() : null)
        .then(article => {
          if (article) setSelectedArticle(article)
        })
    }
  }, [searchParams, selectedArticle])
  
  async function handleFetchAll() {
    for (const source of sources) {
      await fetch(`/api/sources/${source.id}/fetch`, { method: 'POST' })
    }
    fetchSources()
    setRefreshKey(k => k + 1)
  }
  
  async function handleMarkAllRead() {
    const params = new URLSearchParams()
    if (selectedSource) params.set('sourceId', selectedSource)
    await fetch(`/api/articles?${params}`, { method: 'PATCH' })
    setRefreshKey(k => k + 1)
  }
  
  async function handleDeleteSource(id: string) {
    if (!confirm('确定删除此来源及其所有文章？')) return
    await fetch(`/api/sources/${id}`, { method: 'DELETE' })
    if (selectedSource === id) setSelectedSource(null)
    fetchSources()
    setRefreshKey(k => k + 1)
  }
  
  function handleSelectSource(id: string | null) {
    setSelectedSource(id)
    setSelectedArticle(null)
    // Clear article from URL when changing source
    const params = new URLSearchParams(searchParams.toString())
    params.delete('article')
    router.push(params.toString() ? `?${params.toString()}` : '/', { scroll: false })
  }
  
  function handleArticleUpdate(updated: Article) {
    setSelectedArticle(updated)
  }
  
  return (
    <div className="flex h-screen bg-zinc-900 overflow-hidden">
      <Sidebar
        sources={sources}
        selectedSource={selectedSource}
        onSelectSource={handleSelectSource}
        onAddSource={() => setShowAddModal(true)}
        onFetchAll={handleFetchAll}
        onRefresh={fetchSources}
        onDeleteSource={handleDeleteSource}
        filter={filter}
        onFilterChange={setFilter}
      />
      <main className="flex-1 min-w-0 overflow-hidden flex">
        {/* Article List - always visible */}
        <div className={`${selectedArticle ? 'hidden lg:block lg:w-96' : 'w-full'} border-r border-zinc-800 flex flex-col overflow-hidden`}>
          <div className="p-3 border-b border-zinc-800 flex gap-2 flex-shrink-0">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索文章..."
              className="flex-1 px-3 py-1.5 bg-zinc-800 rounded border border-zinc-700 text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleMarkAllRead}
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded whitespace-nowrap"
            >
              全部已读
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <ArticleList
              key={refreshKey}
              sourceId={selectedSource}
              filter={filter}
              search={search}
              selectedId={selectedArticle?.id || null}
              onSelectArticle={setSelectedArticle}
            />
          </div>
        </div>
        
        {/* Article View */}
        {selectedArticle && (
          <div className="flex-1 min-w-0 overflow-hidden">
            <ArticleView
              article={selectedArticle}
              onClose={() => setSelectedArticle(null)}
              onUpdate={handleArticleUpdate}
            />
          </div>
        )}
        
        {/* Empty state when no article selected on large screens */}
        {!selectedArticle && (
          <div className="hidden lg:flex flex-1 items-center justify-center text-zinc-600">
            选择一篇文章阅读
          </div>
        )}
      </main>
      {showAddModal && (
        <AddSourceModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false)
            fetchSources()
          }}
        />
      )}
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-zinc-900 text-zinc-500">加载中...</div>}>
      <HomeContent />
    </Suspense>
  )
}
