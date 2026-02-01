'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Star, BookOpen, BookOpenCheck, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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
  source: { id?: string; name: string; category?: string }
}

interface ArticleReaderProps {
  article: Article
  onClose: () => void
  onUpdate: (article: Article) => void
}

export function ArticleReader({ article: initialArticle, onClose, onUpdate }: ArticleReaderProps) {
  const [article, setArticle] = useState(initialArticle)
  const [loading, setLoading] = useState(false)

  // 当外部传入的文章变化时，同步更新内部状态
  useEffect(() => {
    setArticle(initialArticle)
  }, [initialArticle.id])

  // 获取全文
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
      console.error('获取全文失败:', e)
    } finally {
      setLoading(false)
    }
  }, [article.id, onUpdate])

  // 自动获取全文（如果内容较短）
  useEffect(() => {
    if (!article.content || article.content.length < 500) {
      fetchFullContent()
    }
  }, [article.id, article.content, fetchFullContent])

  // 切换已读状态
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

  // 切换收藏状态
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

  // 键盘快捷键
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          onClose()
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
  }, [article.url, onClose, toggleRead, toggleStarred])

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

  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
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
          {loading && (
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
          {article.content && article.content.length < 300 && !loading && (
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
            <span className="ml-3">m 切换已读</span>
            <span className="ml-3">s 切换收藏</span>
            <span className="ml-3">v 打开原文</span>
          </div>
        </div>
      </article>
    </div>
  )
}
