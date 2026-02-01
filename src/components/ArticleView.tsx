'use client'

import { useEffect, useState, useCallback } from 'react'
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

interface ArticleViewProps {
  article: Article
  onClose: () => void
  onUpdate: (article: Article) => void
}

export function ArticleView({ article: initialArticle, onClose, onUpdate }: ArticleViewProps) {
  const [article, setArticle] = useState(initialArticle)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Fetch full content on mount
  const fetchFullContent = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/articles/${article.id}`, { method: 'POST' })
      if (res.ok) {
        const updated = await res.json()
        setArticle(updated)
        onUpdate(updated)
      }
    } catch (e) {
      console.error('Failed to fetch full content:', e)
    } finally {
      setLoading(false)
    }
  }, [article.id, onUpdate])
  
  useEffect(() => {
    // Only fetch if content seems truncated (short)
    if (!article.content || article.content.length < 500) {
      fetchFullContent()
    }
  }, [article.id, article.content, fetchFullContent])
  
  const toggleRead = useCallback(async () => {
    const newRead = !article.read
    await fetch(`/api/articles/${article.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: newRead })
    })
    const updated = { ...article, read: newRead }
    setArticle(updated)
    onUpdate(updated)
  }, [article, onUpdate])

  const toggleStarred = useCallback(async () => {
    const newStarred = !article.starred
    await fetch(`/api/articles/${article.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: newStarred })
    })
    const updated = { ...article, starred: newStarred }
    setArticle(updated)
    onUpdate(updated)
  }, [article, onUpdate])

  const handleClose = useCallback(() => {
    // Remove article from URL
    const params = new URLSearchParams(searchParams.toString())
    params.delete('article')
    const newUrl = params.toString() ? `?${params.toString()}` : '/'
    router.push(newUrl, { scroll: false })
    onClose()
  }, [searchParams, router, onClose])
  
  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          handleClose()
          break
        case 'm':
          e.preventDefault()
          toggleRead()
          break
        case 's':
          e.preventDefault()
          toggleStarred()
          break
        case 'v':
          e.preventDefault()
          window.open(article.url, '_blank')
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [article.url, handleClose, toggleRead, toggleStarred])
  
  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <div className="p-4 border-b border-zinc-700 flex items-center gap-4 flex-shrink-0">
        <button
          onClick={handleClose}
          className="text-zinc-400 hover:text-white"
        >
          ← 返回 <span className="text-xs text-zinc-600">(Esc)</span>
        </button>
        <span className="text-xs text-zinc-500">{article.source.name}</span>
        <div className="flex-1" />
        <button
          onClick={toggleStarred}
          className={article.starred ? 'text-yellow-400' : 'text-zinc-500 hover:text-yellow-400'}
        >
          {article.starred ? '★' : '☆'} <span className="text-xs">(s)</span>
        </button>
        <button
          onClick={toggleRead}
          className="text-zinc-500 hover:text-white text-sm"
        >
          {article.read ? '标为未读' : '标为已读'} <span className="text-xs">(m)</span>
        </button>
      </div>
      <article className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">{article.title}</h1>
          <div className="flex gap-4 text-sm text-zinc-500 mb-6">
            {article.author && <span>{article.author}</span>}
            {article.publishedAt && (
              <span>{new Date(article.publishedAt).toLocaleString('zh-CN')}</span>
            )}
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              原文链接 (v)
            </a>
          </div>
          {article.imageUrl && (
            <div className="mb-6 max-h-80 overflow-hidden rounded bg-zinc-800">
              <img
                src={article.imageUrl}
                alt=""
                className="w-full h-auto max-h-80 object-contain"
                onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }}
              />
            </div>
          )}
          {loading && (
            <div className="text-zinc-500 mb-4">正在加载全文...</div>
          )}
          <div className="prose prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
            {article.content || '无内容'}
          </div>
          {article.content && article.content.length < 300 && !loading && (
            <button
              onClick={fetchFullContent}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
            >
              尝试获取全文
            </button>
          )}
        </div>
      </article>
    </div>
  )
}
