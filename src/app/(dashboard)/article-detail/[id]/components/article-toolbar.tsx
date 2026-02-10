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
import { ReadingThemePicker } from '@/components/reading-theme-picker'

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
    <div className="flex items-center justify-between px-2 md:px-4 py-2 md:py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-1 md:gap-2 min-w-0">
        {/* 展开侧边栏按钮 */}
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSidebar}
            className="h-8 w-8 p-0 flex-shrink-0"
            title="显示文章列表 (B)"
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground flex-shrink-0"
          title="返回 (Esc)"
        >
          <X className="w-4 h-4" />
          <span className="ml-1 hidden md:inline">返回</span>
          <kbd className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded hidden md:inline">Esc</kbd>
        </Button>
        <Badge variant="secondary" className="font-normal truncate max-w-[80px] md:max-w-none">
          {sourceName}
        </Badge>
      </div>

      <div className="flex items-center gap-0.5 md:gap-1 flex-shrink-0">
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

        <div className="w-px h-4 bg-border mx-0.5 md:mx-1 hidden md:block" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleStarred}
          className={cn(
            "h-8 w-8 p-0 transition-colors",
            starred ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-amber-500"
          )}
          title="收藏 (S)"
        >
          <Star className={cn("w-4 h-4", starred && "fill-current")} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleRead}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hidden md:flex"
          title={read ? '标记为未读 (M)' : '标记为已读 (M)'}
        >
          {read ? (
            <BookOpenCheck className="w-4 h-4" />
          ) : (
            <BookOpen className="w-4 h-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenOriginal}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
          title="查看原文 (V)"
        >
          <ExternalLink className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
          title="刷新文章内容 (R)"
        >
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
        </Button>

        <div className="w-px h-4 bg-border mx-0.5 md:mx-1 hidden md:block" />

        {/* 阅读主题选择器 - 移动端隐藏 */}
        <div className="hidden md:block">
          <ReadingThemePicker />
        </div>
      </div>
    </div>
  )
}
