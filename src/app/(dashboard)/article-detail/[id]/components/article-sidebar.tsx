'use client'

import { RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PanelLeftClose } from 'lucide-react'
import ArticleListItem, { ArticleItem } from '@/components/article-list-item'

interface ArticleSidebarProps {
  articles: ArticleItem[]
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
            <ArticleListItem
              key={article.id}
              article={article}
              isActive={article.id === currentArticleId}
              compact={true}
              showActions={false}
              onClick={() => onNavigate(article.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
