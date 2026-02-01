'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

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

interface ArticleListProps {
  sourceId: string | null
  filter: 'all' | 'unread' | 'starred'
  search?: string
  selectedId: string | null
  onSelectArticle: (article: Article | null) => void
}

export function ArticleList({ sourceId, filter, search, selectedId, onSelectArticle }: ArticleListProps) {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [focusIndex, setFocusIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const fetchArticles = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (sourceId) params.set('sourceId', sourceId)
    if (filter === 'unread') params.set('unread', 'true')
    if (filter === 'starred') params.set('starred', 'true')
    if (search) params.set('q', search)
    
    const res = await fetch(`/api/articles?${params}`)
    const data = await res.json()
    setArticles(data.articles)
    setFocusIndex(0)
    setLoading(false)
  }, [sourceId, filter, search])
  
  useEffect(() => {
    const timer = setTimeout(fetchArticles, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchArticles, search])
  
  // Load selected article from URL
  useEffect(() => {
    const articleId = searchParams.get('article')
    if (articleId && articles.length > 0) {
      const idx = articles.findIndex(a => a.id === articleId)
      if (idx >= 0) {
        // Use callback to avoid direct setState in effect
        requestAnimationFrame(() => {
          setFocusIndex(idx)
          onSelectArticle(articles[idx])
        })
      }
    }
  }, [searchParams, articles, onSelectArticle])
  
  const toggleRead = useCallback(async (article: Article) => {
    await fetch(`/api/articles/${article.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: !article.read })
    })
    setArticles(prev => prev.map(a =>
      a.id === article.id ? { ...a, read: !a.read } : a
    ))
  }, [])

  const toggleStarred = useCallback(async (article: Article) => {
    await fetch(`/api/articles/${article.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: !article.starred })
    })
    setArticles(prev => prev.map(a =>
      a.id === article.id ? { ...a, starred: !a.starred } : a
    ))
  }, [])

  const selectArticle = useCallback((article: Article, index: number) => {
    setFocusIndex(index)
    if (!article.read) {
      fetch(`/api/articles/${article.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true })
      }).then(() => {
        setArticles(prev => prev.map(a =>
          a.id === article.id ? { ...a, read: true } : a
        ))
      })
    }

    // Update URL
    const params = new URLSearchParams(searchParams.toString())
    params.set('article', article.id)
    router.push(`?${params.toString()}`, { scroll: false })

    onSelectArticle(article)
  }, [searchParams, router, onSelectArticle])
  
  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      if (selectedId) return // Don't navigate when article is open
      
      const current = articles[focusIndex]
      
      switch (e.key) {
        case 'j':
          e.preventDefault()
          setFocusIndex(i => Math.min(i + 1, articles.length - 1))
          break
        case 'k':
          e.preventDefault()
          setFocusIndex(i => Math.max(i - 1, 0))
          break
        case 'o':
        case 'Enter':
          e.preventDefault()
          if (current) selectArticle(current, focusIndex)
          break
        case 'm':
          e.preventDefault()
          if (current) toggleRead(current)
          break
        case 's':
          e.preventDefault()
          if (current) toggleStarred(current)
          break
        case 'v':
          e.preventDefault()
          if (current) window.open(current.url, '_blank')
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [articles, focusIndex, selectedId, selectArticle, toggleRead, toggleStarred])
  
  // Scroll focused item into view
  useEffect(() => {
    if (selectedId || !listRef.current) return
    const item = listRef.current.children[focusIndex] as HTMLElement
    item?.scrollIntoView({ block: 'nearest' })
  }, [focusIndex, selectedId])
  
  if (loading) {
    return <div className="flex items-center justify-center h-full text-zinc-500">加载中...</div>
  }
  
  if (articles.length === 0) {
    return <div className="flex items-center justify-center h-full text-zinc-500">暂无文章</div>
  }
  
  return (
    <div ref={listRef} className="divide-y divide-zinc-800">
      {articles.map((article, index) => (
        <div
          key={article.id}
          className={`p-4 cursor-pointer flex gap-4 transition-colors overflow-hidden ${
            article.read ? 'opacity-60' : ''
          } ${index === focusIndex ? 'bg-zinc-800 ring-1 ring-blue-500/50' : 'hover:bg-zinc-800'}
          ${selectedId === article.id ? 'bg-blue-900/30' : ''}`}
          onClick={() => selectArticle(article, index)}
        >
          {article.imageUrl && (
            <div className="w-24 h-16 flex-shrink-0 overflow-hidden rounded bg-zinc-800 relative">
              <img
                src={article.imageUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }}
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-white truncate">{article.title}</h3>
            <p className="text-sm text-zinc-400 line-clamp-2 mt-1">
              {article.content?.slice(0, 150)}
            </p>
            <div className="flex gap-3 mt-2 text-xs text-zinc-500">
              <span>{article.source.name}</span>
              {article.publishedAt && (
                <span>{new Date(article.publishedAt).toLocaleDateString('zh-CN')}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); toggleStarred(article) }}
              className={article.starred ? 'text-yellow-400' : 'text-zinc-600 hover:text-yellow-400'}
            >
              {article.starred ? '★' : '☆'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); toggleRead(article) }}
              className={`text-xs ${article.read ? 'text-zinc-600' : 'text-blue-400'}`}
            >
              {article.read ? '已读' : '未读'}
            </button>
          </div>
        </div>
      ))}
      <div className="p-4 text-center text-xs text-zinc-600">
        快捷键: j/k 上下移动 · o/Enter 打开 · m 已读 · s 收藏 · v 原文 · Esc 返回
      </div>
    </div>
  )
}
