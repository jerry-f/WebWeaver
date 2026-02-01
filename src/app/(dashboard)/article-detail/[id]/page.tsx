'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import ArticleCompare from '@/components/article-compare'
import ArticleSidebar from './components/article-sidebar'
import ArticleToolbar from './components/article-toolbar'
import ArticleContent from './components/article-content'

interface Source {
  id?: string
  name: string
  category?: string
}

interface Article {
  id: string
  title: string
  content?: string
  summary?: string
  url: string
  imageUrl?: string
  author?: string
  publishedAt?: string
  fetchedAt?: string
  read: boolean
  starred: boolean
  source: Source
}

interface ArticleVersion {
  title: string
  content: string | null
  summary: string | null
  tags: string | null
  category: string | null
  imageUrl: string | null
  author: string | null
  publishedAt: string | null
}

export default function ArticleDetailPage() {
  const router = useRouter()
  const params = useParams()
  const articleId = params.id as string

  // 状态
  const [article, setArticle] = useState<Article | null>(null)
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [refreshing, setRefreshing] = useState(false)
  const [compareData, setCompareData] = useState<{
    oldVersion: ArticleVersion;
    newVersion: ArticleVersion;
  } | null>(null)

  const listRef = useRef<HTMLDivElement>(null)

  // 获取文章列表（用于侧边栏快速切换）
  useEffect(() => {
    fetch('/api/articles?limit=50')
      .then(res => res.json())
      .then(data => {
        const list = data.articles || []
        setArticles(list)
        const idx = list.findIndex((a: Article) => a.id === articleId)
        setCurrentIndex(idx)
      })
      .catch(console.error)
  }, [articleId])

  // 获取当前文章详情
  useEffect(() => {
    if (!articleId) return

    setLoading(true)
    fetch(`/api/articles/${articleId}`)
      .then(res => res.json())
      .then(data => {
        setArticle(data)
        // 标记为已读
        if (!data.read) {
          fetch(`/api/articles/${articleId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ read: true })
          })
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [articleId])

  // 获取全文
  const fetchFullContent = useCallback(async () => {
    if (!article) return
    setContentLoading(true)
    try {
      const res = await fetch(`/api/articles/${article.id}`, { method: 'POST' })
      if (res.ok) {
        const updated = await res.json()
        setArticle(updated)
      }
    } catch (e) {
      console.error('获取全文失败:', e)
    } finally {
      setContentLoading(false)
    }
  }, [article])

  // 切换已读状态
  const toggleRead = useCallback(async () => {
    if (!article) return
    const newRead = !article.read
    await fetch(`/api/articles/${article.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: newRead })
    })
    setArticle({ ...article, read: newRead })
    setArticles(prev => prev.map(a => a.id === article.id ? { ...a, read: newRead } : a))
  }, [article])

  // 切换收藏状态
  const toggleStarred = useCallback(async () => {
    if (!article) return
    const newStarred = !article.starred
    await fetch(`/api/articles/${article.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: newStarred })
    })
    setArticle({ ...article, starred: newStarred })
    setArticles(prev => prev.map(a => a.id === article.id ? { ...a, starred: newStarred } : a))
  }, [article])

  // 刷新文章内容（重新抓取并对比）
  const refreshArticle = useCallback(async () => {
    if (!article || refreshing) return
    setRefreshing(true)
    try {
      const res = await fetch(`/api/articles/${article.id}/refresh`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setCompareData({
            oldVersion: data.oldVersion,
            newVersion: data.newVersion,
          })
          setArticle(data.article)
        }
      }
    } catch (e) {
      console.error('刷新文章失败:', e)
    } finally {
      setRefreshing(false)
    }
  }, [article, refreshing])

  // 返回列表
  const goBack = useCallback(() => {
    router.push('/articles')
  }, [router])

  // 切换到其他文章
  const navigateToArticle = useCallback((id: string) => {
    router.push(`/article-detail/${id}`)
  }, [router])

  // 上一篇/下一篇
  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      navigateToArticle(articles[currentIndex - 1].id)
    }
  }, [currentIndex, articles, navigateToArticle])

  const goNext = useCallback(() => {
    if (currentIndex < articles.length - 1) {
      navigateToArticle(articles[currentIndex + 1].id)
    }
  }, [currentIndex, articles, navigateToArticle])

  // 键盘快捷键
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          goBack()
          break
        case 'm':
          e.preventDefault()
          toggleRead()
          break
        case 's':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            toggleStarred()
          }
          break
        case 'v':
          e.preventDefault()
          if (article) window.open(article.url, '_blank')
          break
        case 'r':
          e.preventDefault()
          refreshArticle()
          break
        case 'j':
          e.preventDefault()
          goNext()
          break
        case 'k':
          e.preventDefault()
          goPrev()
          break
        case 'b':
          e.preventDefault()
          setSidebarOpen(prev => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [article, goBack, toggleRead, toggleStarred, goNext, goPrev, refreshArticle])

  // 滚动到当前文章
  useEffect(() => {
    if (sidebarOpen && listRef.current && currentIndex >= 0) {
      const item = listRef.current.children[currentIndex] as HTMLElement
      item?.scrollIntoView({ block: 'center' })
    }
  }, [sidebarOpen, currentIndex])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        加载中...
      </div>
    )
  }

  if (!article) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] text-muted-foreground">
        <p className="text-lg mb-4">文章不存在</p>
        <Button onClick={goBack}>返回列表</Button>
      </div>
    )
  }

  return (
    <>
      {/* 对比视图 */}
      {compareData && (
        <ArticleCompare
          oldVersion={compareData.oldVersion}
          newVersion={compareData.newVersion}
          onClose={() => setCompareData(null)}
          onAccept={() => setCompareData(null)}
        />
      )}

      <div className="flex h-[calc(100vh-3.5rem)] -m-4 lg:-m-6 overflow-hidden">
        {/* 侧边栏 - 文章列表 */}
        <ArticleSidebar
          articles={articles}
          currentArticleId={articleId}
          sidebarOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNavigate={navigateToArticle}
          listRef={listRef}
        />

        {/* 主内容区 */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col bg-card">
          {/* 顶部工具栏 */}
          <ArticleToolbar
            sourceName={article.source.name}
            starred={article.starred}
            read={article.read}
            refreshing={refreshing}
            sidebarOpen={sidebarOpen}
            canGoPrev={currentIndex > 0}
            canGoNext={currentIndex < articles.length - 1}
            onBack={goBack}
            onToggleSidebar={() => setSidebarOpen(true)}
            onToggleStarred={toggleStarred}
            onToggleRead={toggleRead}
            onOpenOriginal={() => window.open(article.url, '_blank')}
            onRefresh={refreshArticle}
            onGoPrev={goPrev}
            onGoNext={goNext}
          />

          {/* 文章内容 */}
          <ArticleContent
            title={article.title}
            content={article.content}
            summary={article.summary}
            author={article.author}
            publishedAt={article.publishedAt}
            url={article.url}
            imageUrl={article.imageUrl}
            contentLoading={contentLoading}
            onFetchFullContent={fetchFullContent}
          />
        </div>
      </div>
    </>
  )
}
