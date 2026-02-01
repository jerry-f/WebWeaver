'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  X,
  Star,
  BookOpen,
  BookOpenCheck,
  ExternalLink,
  PanelLeft,
  ChevronUp,
  ChevronDown,
  RefreshCw
} from 'lucide-react'

interface ArticleToolbarProps {
  sourceName: string
  starred: boolean
  read: boolean
  refreshing: boolean
  sidebarOpen: boolean
  canGoPrev: boolean
  canGoNext: boolean
  onBack: () => void
  onToggleSidebar: () => void
  onToggleStarred: () => void
  onToggleRead: () => void
  onOpenOriginal: () => void
  onRefresh: () => void
  onGoPrev: () => void
  onGoNext: () => void
}

export default function ArticleToolbar({
  sourceName,
  starred,
  read,
  refreshing,
  sidebarOpen,
  canGoPrev,
  canGoNext,
  onBack,
  onToggleSidebar,
  onToggleStarred,
  onToggleRead,
  onOpenOriginal,
  onRefresh,
  onGoPrev,
  onGoNext,
}: ArticleToolbarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-2">
        {/* 展开侧边栏按钮 */}
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSidebar}
            className="h-8 w-8 p-0"
            title="显示文章列表 (B)"
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4 mr-1" />
          返回
          <kbd className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded">Esc</kbd>
        </Button>
        <Badge variant="secondary" className="font-normal">
          {sourceName}
        </Badge>
      </div>

      <div className="flex items-center gap-1">
        {/* 上一篇/下一篇 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onGoPrev}
          disabled={!canGoPrev}
          className="h-8 w-8 p-0"
          title="上一篇 (K)"
        >
          <ChevronUp className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onGoNext}
          disabled={!canGoNext}
          className="h-8 w-8 p-0"
          title="下一篇 (J)"
        >
          <ChevronDown className="w-4 h-4" />
        </Button>

        <div className="w-px h-4 bg-border mx-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleStarred}
          className={cn(
            "transition-colors",
            starred ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-amber-500"
          )}
        >
          <Star className={cn("w-4 h-4", starred && "fill-current")} />
          <kbd className="ml-1 text-xs bg-muted px-1 py-0.5 rounded">s</kbd>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleRead}
          className="text-muted-foreground hover:text-foreground"
        >
          {read ? (
            <BookOpenCheck className="w-4 h-4" />
          ) : (
            <BookOpen className="w-4 h-4" />
          )}
          <span className="ml-1 text-xs">{read ? '已读' : '未读'}</span>
          <kbd className="ml-1 text-xs bg-muted px-1 py-0.5 rounded">m</kbd>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenOriginal}
          className="text-muted-foreground hover:text-primary"
        >
          <ExternalLink className="w-4 h-4" />
          <span className="ml-1 text-xs">原文</span>
          <kbd className="ml-1 text-xs bg-muted px-1 py-0.5 rounded">v</kbd>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
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
  )
}
