'use client'

import { RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { cn, timeAgo } from '@/lib/utils'
import { PanelLeftClose } from 'lucide-react'

interface Article {
  id: string
  title: string
  read: boolean
  fetchedAt?: string
  publishedAt?: string
  source: { name: string }
}

interface ArticleSidebarProps {
  articles: Article[]
  currentArticleId: string
  sidebarOpen: boolean
  onClose: () => void
  onNavigate: (id: string) => void
  listRef: RefObject<HTMLDivElement | null>
}

export default function ArticleSidebar({
  articles,
  currentArticleId,
  sidebarOpen,
  onClose,
  onNavigate,
  listRef,
}: ArticleSidebarProps) {
  return (
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
            onClick={onClose}
            className="h-7 w-7 p-0"
          >
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>

        {/* 文章列表 */}
        <div ref={listRef} className="flex-1 overflow-auto">
          {articles.map((article) => (
            <div
              key={article.id}
              onClick={() => onNavigate(article.id)}
              className={cn(
                "px-3 py-2.5 border-b border-border/30 cursor-pointer transition-all duration-150",
                article.read && "opacity-50",
                article.id === currentArticleId && "bg-primary/10 border-l-2 border-l-primary",
                article.id !== currentArticleId && "hover:bg-muted/30"
              )}
            >
              <h4 className={cn(
                "text-sm font-medium line-clamp-2 mb-1",
                article.id === currentArticleId ? "text-primary" : "text-foreground"
              )}>
                {article.title}
              </h4>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{article.source.name}</span>
                <span>·</span>
                <span>{timeAgo(article.fetchedAt || article.publishedAt || '')}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
