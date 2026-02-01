'use client'

import { useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArticleList, ArticleListRef } from '@/components/article-list'
import { ArticleReader } from '@/components/article-reader'
import { Newspaper, Loader2 } from 'lucide-react'

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

function ArticlesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const listRef = useRef<ArticleListRef>(null)

  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)

  // 选择文章
  const handleSelectArticle = useCallback((article: Article) => {
    setSelectedArticle(article)
    // 更新 URL
    const params = new URLSearchParams(searchParams.toString())
    params.set('id', article.id)
    router.push(`/articles?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  // 关闭阅读器
  const handleCloseReader = useCallback(() => {
    setSelectedArticle(null)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('id')
    router.push(`/articles${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
  }, [searchParams, router])

  // 更新文章状态
  const handleArticleUpdate = useCallback((updated: Article) => {
    setSelectedArticle(updated)
    // 刷新列表
    listRef.current?.refresh()
  }, [])

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -m-4 lg:-m-6 overflow-hidden">
      {/* 文章列表面板 - 独立组件 */}
      <div className="w-80 lg:w-[360px] flex-shrink-0 border-r border-border bg-background overflow-hidden">
        <ArticleList
          ref={listRef}
          selectedId={selectedArticle?.id || null}
          onSelect={handleSelectArticle}
        />
      </div>

      {/* 文章阅读区域 - 独立组件 */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {selectedArticle ? (
          <ArticleReader
            article={selectedArticle}
            onClose={handleCloseReader}
            onUpdate={handleArticleUpdate}
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-gradient-to-br from-background to-muted/20">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-muted/30 flex items-center justify-center">
                <Newspaper className="w-10 h-10 text-muted-foreground/40" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-medium text-muted-foreground">选择一篇文章开始阅读</p>
                <p className="text-sm text-muted-foreground/60">
                  使用 <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">j</kbd> / <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">k</kbd> 键上下移动，<kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Enter</kbd> 键打开
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ArticlesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        加载中...
      </div>
    }>
      <ArticlesContent />
    </Suspense>
  )
}
