'use client'

import { Badge } from '@/components/ui/badge'
import { cn, timeAgo } from '@/lib/utils'
import { Clock, Star, BookOpen, BookOpenCheck } from 'lucide-react'

interface Source {
  id?: string
  name: string
  category?: string
}

export interface ArticleItem {
  id: string
  title: string
  summary?: string | null
  url: string
  read: boolean
  starred: boolean
  fetchedAt?: string
  publishedAt?: string
  source: Source
}

interface ArticleListItemProps {
  article: ArticleItem
  isActive?: boolean
  isFocused?: boolean
  compact?: boolean  // 紧凑模式（用于侧边栏）
  showActions?: boolean  // 是否显示操作按钮
  onClick?: () => void
  onToggleStarred?: (e: React.MouseEvent) => void
  onToggleRead?: (e: React.MouseEvent) => void
}

export default function ArticleListItem({
  article,
  isActive = false,
  isFocused = false,
  compact = false,
  showActions = true,
  onClick,
  onToggleStarred,
  onToggleRead,
}: ArticleListItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group cursor-pointer transition-all duration-150 border-b",
        compact ? "px-3 py-2.5 border-border/30" : "px-4 py-3.5 border-border/30",
        article.read && "opacity-55",
        isActive && "bg-primary/10 border-l-2 border-l-primary",
        isFocused && !isActive && "bg-primary/5 border-l-2 border-l-primary -ml-[2px] pl-[calc(1rem+2px)]",
        !isActive && !isFocused && "hover:bg-muted/30"
      )}
    >
      <div className="flex gap-3">
        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <h3 className={cn(
            "font-medium leading-snug transition-colors",
            compact ? "text-sm line-clamp-2" : "text-[15px] line-clamp-2",
            isActive ? "text-primary" : "text-foreground group-hover:text-primary"
          )}>
            {article.title}
          </h3>

          {/* AI 摘要预览 */}
          {article.summary && (
            <p className={cn(
              "text-muted-foreground/80 line-clamp-2 leading-relaxed",
              compact ? "text-[11px] mt-0.5" : "text-xs mt-1"
            )}>
              {article.summary}
            </p>
          )}

          <div className={cn(
            "flex items-center gap-2",
            compact ? "mt-1" : "mt-1.5"
          )}>
            <Badge
              variant="secondary"
              className={cn(
                "font-normal bg-muted/50",
                compact ? "text-[9px] px-1 py-0 h-3.5" : "text-[10px] px-1.5 py-0 h-4"
              )}
            >
              {article.source.name}
            </Badge>
            <span className={cn(
              "text-muted-foreground/70 flex items-center gap-0.5",
              compact ? "text-[9px]" : "text-[10px]"
            )}>
              <Clock className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
              {timeAgo(article.fetchedAt || article.publishedAt || '')}
            </span>
          </div>
        </div>

        {/* 操作按钮 */}
        {showActions && (onToggleStarred || onToggleRead) && (
          <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {onToggleStarred && (
              <button
                onClick={onToggleStarred}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  article.starred ? "text-amber-500 opacity-100" : "hover:text-amber-500 hover:bg-muted/50"
                )}
              >
                <Star className={cn("w-4 h-4", article.starred && "fill-current")} />
              </button>
            )}
            {onToggleRead && (
              <button
                onClick={onToggleRead}
                className="p-1.5 rounded-md hover:text-primary hover:bg-muted/50 transition-colors"
              >
                {article.read ? <BookOpenCheck className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
              </button>
            )}
          </div>
        )}

        {/* 收藏标记（始终可见） */}
        {article.starred && showActions && (
          <div className="flex-shrink-0 group-hover:hidden">
            <Star className="w-4 h-4 text-amber-500 fill-current" />
          </div>
        )}
      </div>
    </div>
  )
}
