'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn, timeAgo } from '@/lib/utils'
import ArticleCompare from '@/components/article-compare'
import {
  X,
  Star,
  BookOpen,
  BookOpenCheck,
  ExternalLink,
  Loader2,
  PanelLeft,
  PanelLeftClose,
  Clock,
  ChevronUp,
  ChevronDown,
  RefreshCw
} from 'lucide-react'

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

  // 自动获取全文（如果内容较短）
  useEffect(() => {
    if (article && (!article.content || article.content.length < 500)) {
      fetchFullContent()
    }
  }, [article?.id])

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
          // 更新当前文章
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

  // 格式化日期
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

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
      {/* 侧边栏 - 文章列表（默认收起） */}
      <div className={cn(
        "flex-shrink-0 border-r border-border bg-card overflow-hidden transition-all duration-300 ease-in-out",
        sidebarOpen ? "w-80" : "w-0 border-r-0"
      )}>
        <div className={cn(
          "w-80 h-full flex flex-col transition-opacity duration-200",
          sidebarOpen ? "opacity-100" : "opacity-0"
        )}>
          {/* 侧边栏头部 */}
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium">文章列表</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(false)}
              className="h-7 w-7 p-0"
            >
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          </div>

          {/* 文章列表 */}
          <div ref={listRef} className="flex-1 overflow-auto">
            {articles.map((a, index) => (
              <div
                key={a.id}
                onClick={() => navigateToArticle(a.id)}
                className={cn(
                  "px-3 py-2.5 border-b border-border/30 cursor-pointer transition-all duration-150",
                  a.read && "opacity-50",
                  a.id === articleId && "bg-primary/10 border-l-2 border-l-primary",
                  a.id !== articleId && "hover:bg-muted/30"
                )}
              >
                <h4 className={cn(
                  "text-sm font-medium line-clamp-2 mb-1",
                  a.id === articleId ? "text-primary" : "text-foreground"
                )}>
                  {a.title}
                </h4>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{a.source.name}</span>
                  <span>·</span>
                  <span>{timeAgo(a.fetchedAt || a.publishedAt || '')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col bg-card">
        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-2">
            {/* 展开侧边栏按钮 */}
            {!sidebarOpen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="h-8 w-8 p-0"
                title="显示文章列表 (B)"
              >
                <PanelLeft className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={goBack}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4 mr-1" />
              返回
              <kbd className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded">Esc</kbd>
            </Button>
            <Badge variant="secondary" className="font-normal">
              {article.source.name}
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            {/* 上一篇/下一篇 */}
            <Button
              variant="ghost"
              size="sm"
              onClick={goPrev}
              disabled={currentIndex <= 0}
              className="h-8 w-8 p-0"
              title="上一篇 (K)"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={goNext}
              disabled={currentIndex >= articles.length - 1}
              className="h-8 w-8 p-0"
              title="下一篇 (J)"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>

            <div className="w-px h-4 bg-border mx-1" />

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleStarred}
              className={cn(
                "transition-colors",
                article.starred ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-amber-500"
              )}
            >
              <Star className={cn("w-4 h-4", article.starred && "fill-current")} />
              <kbd className="ml-1 text-xs bg-muted px-1 py-0.5 rounded">s</kbd>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleRead}
              className="text-muted-foreground hover:text-foreground"
            >
              {article.read ? (
                <BookOpenCheck className="w-4 h-4" />
              ) : (
                <BookOpen className="w-4 h-4" />
              )}
              <span className="ml-1 text-xs">{article.read ? '已读' : '未读'}</span>
              <kbd className="ml-1 text-xs bg-muted px-1 py-0.5 rounded">m</kbd>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(article.url, '_blank')}
              className="text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="ml-1 text-xs">原文</span>
              <kbd className="ml-1 text-xs bg-muted px-1 py-0.5 rounded">v</kbd>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshArticle}
              disabled={refreshing}
              className="text-muted-foreground hover:text-primary"
              title="刷新文章内容"
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
              <span className="ml-1 text-xs">刷新</span>
              <kbd className="ml-1 text-xs bg-muted px-1 py-0.5 rounded">r</kbd>
            </Button>
          </div>
        </div>

        {/* 文章内容 */}
        <article className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">
            {/* 标题 */}
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground leading-tight mb-4">
              {article.title}
            </h1>

            {/* 元信息 */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-6 pb-6 border-b border-border">
              {article.author && (
                <span className="font-medium">{article.author}</span>
              )}
              {article.publishedAt && (
                <span>{formatDate(article.publishedAt)}</span>
              )}
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                查看原文
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* 封面图 */}
            {article.imageUrl && (
              <div className="mb-6 rounded-lg overflow-hidden bg-muted">
                <img
                  src={article.imageUrl}
                  alt=""
                  className="w-full h-auto max-h-80 object-contain"
                  onError={(e) => {
                    (e.currentTarget.parentElement as HTMLElement).style.display = 'none'
                  }}
                />
              </div>
            )}

            {/* 加载状态 */}
            {contentLoading && (
              <div className="flex items-center gap-2 text-muted-foreground mb-4 p-4 bg-muted/30 rounded-lg">
                <Loader2 className="w-4 h-4 animate-spin" />
                正在加载全文...
              </div>
            )}

            {/* 正文内容 */}
            <div
              className="prose prose-neutral dark:prose-invert max-w-none
                prose-headings:font-serif prose-headings:text-foreground
                prose-p:text-foreground prose-p:leading-relaxed
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                prose-strong:text-foreground
                prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:rounded
                prose-pre:bg-muted prose-pre:border prose-pre:border-border
                prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
                prose-img:rounded-lg"
              dangerouslySetInnerHTML={{
                __html: article.content || article.summary || '<p class="text-muted-foreground">暂无内容</p>'
              }}
            />

            {/* 获取全文按钮 */}
            {article.content && article.content.length < 300 && !contentLoading && (
              <Button
                onClick={fetchFullContent}
                variant="outline"
                className="mt-6"
              >
                <Loader2 className="w-4 h-4 mr-2" />
                尝试获取全文
              </Button>
            )}

            {/* 快捷键提示 */}
            <div className="mt-12 pt-6 border-t border-border text-xs text-muted-foreground">
              <span className="font-medium">快捷键：</span>
              <span className="ml-2">Esc 返回</span>
              <span className="ml-3">j/k 上下篇</span>
              <span className="ml-3">m 切换已读</span>
              <span className="ml-3">s 切换收藏</span>
              <span className="ml-3">v 打开原文</span>
              <span className="ml-3">r 刷新内容</span>
              <span className="ml-3">b 切换列表</span>
            </div>
          </div>
        </article>
      </div>
    </div>
    </>
  )
}
