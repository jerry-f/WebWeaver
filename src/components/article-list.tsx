'use client'

import { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, timeAgo } from '@/lib/utils'
import {
  Newspaper,
  Clock,
  Star,
  Search,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  BookOpenCheck,
  Loader2,
  X,
  Layers,
  Rss
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

// 状态筛选
const statusFilters = [
  { value: 'all', label: '全部', icon: Newspaper },
  { value: 'unread', label: '未读', icon: BookOpen },
  { value: 'starred', label: '收藏', icon: Star },
]

// 分类选项
const categories = [
  { value: '', label: '全部' },
  { value: 'tech', label: '科技' },
  { value: 'ai', label: 'AI' },
  { value: 'frontend', label: '前端' },
  { value: 'backend', label: '后端' },
  { value: 'investment', label: '投资' },
]

export interface ArticleListRef {
  refresh: () => void
}

interface ArticleListProps {
  selectedId: string | null
  onSelect: (article: Article) => void
}

export const ArticleList = forwardRef<ArticleListRef, ArticleListProps>(
  function ArticleList({ selectedId, onSelect }, ref) {
    const listRef = useRef<HTMLDivElement>(null)

    // 数据状态
    const [articles, setArticles] = useState<Article[]>([])
    const [sources, setSources] = useState<Source[]>([])
    const [loading, setLoading] = useState(true)
    const [focusIndex, setFocusIndex] = useState(0)

    // 筛选状态
    const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'starred'>('all')
    const [filterTab, setFilterTab] = useState<'source' | 'category'>('source')
    const [sourceId, setSourceId] = useState('')
    const [category, setCategory] = useState('')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [total, setTotal] = useState(0)

    // 获取来源列表
    useEffect(() => {
      fetch('/api/sources')
        .then(res => res.json())
        .then(data => setSources(data))
        .catch(console.error)
    }, [])

    // 获取文章列表
    const fetchArticles = useCallback(async () => {
      setLoading(true)
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '20')
      if (statusFilter === 'unread') params.set('unread', 'true')
      if (statusFilter === 'starred') params.set('starred', 'true')
      if (category) params.set('category', category)
      if (sourceId) params.set('sourceId', sourceId)
      if (search) params.set('q', search)

      try {
        const res = await fetch(`/api/articles?${params}`)
        const data = await res.json()
        setArticles(data.articles || [])
        setTotal(data.pagination?.total || 0)
        setTotalPages(data.pagination?.totalPages || 1)
      } catch (e) {
        console.error('获取文章失败:', e)
      } finally {
        setLoading(false)
      }
    }, [page, statusFilter, category, sourceId, search])

    useEffect(() => {
      const timer = setTimeout(fetchArticles, search ? 300 : 0)
      return () => clearTimeout(timer)
    }, [fetchArticles, search])

    // 暴露刷新方法
    useImperativeHandle(ref, () => ({
      refresh: fetchArticles
    }))

    // 切换收藏
    const toggleStarred = useCallback(async (article: Article, e: React.MouseEvent) => {
      e.stopPropagation()
      const newStarred = !article.starred
      await fetch(`/api/articles/${article.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: newStarred })
      })
      setArticles(prev => prev.map(a =>
        a.id === article.id ? { ...a, starred: newStarred } : a
      ))
    }, [])

    // 切换已读
    const toggleRead = useCallback(async (article: Article, e: React.MouseEvent) => {
      e.stopPropagation()
      const newRead = !article.read
      await fetch(`/api/articles/${article.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: newRead })
      })
      setArticles(prev => prev.map(a =>
        a.id === article.id ? { ...a, read: newRead } : a
      ))
    }, [])

    // 选择文章
    const selectArticle = useCallback((article: Article, index: number) => {
      setFocusIndex(index)

      // 标记为已读
      if (!article.read) {
        fetch(`/api/articles/${article.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ read: true })
        }).then(() => {
          setArticles(prev => prev.map(a =>
            a.id === article.id ? { ...a, read: true } : a
          ))
        })
      }

      onSelect(article)
    }, [onSelect])

    // 键盘导航
    useEffect(() => {
      function handleKeyDown(e: KeyboardEvent) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

        const current = articles[focusIndex]

        switch (e.key) {
          case 'j':
            e.preventDefault()
            setFocusIndex(i => Math.min(i + 1, articles.length - 1))
            break
          case 'k':
            e.preventDefault()
            setFocusIndex(i => Math.max(i - 1, 0))
            break
          case 'o':
          case 'Enter':
            e.preventDefault()
            if (current) selectArticle(current, focusIndex)
            break
          case 'm':
            e.preventDefault()
            if (current) {
              const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent
              toggleRead(current, fakeEvent)
            }
            break
          case 's':
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault()
              if (current) {
                const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent
                toggleStarred(current, fakeEvent)
              }
            }
            break
          case 'v':
            e.preventDefault()
            if (current) window.open(current.url, '_blank')
            break
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [articles, focusIndex, selectArticle, toggleRead, toggleStarred])

    // 滚动到焦点项
    useEffect(() => {
      if (!listRef.current) return
      const item = listRef.current.children[focusIndex] as HTMLElement
      item?.scrollIntoView({ block: 'nearest' })
    }, [focusIndex])

    return (
      <div className="flex flex-col h-full bg-card/50">
        {/* 搜索栏 */}
        <div className="p-3 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索文章..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-9 bg-background/60 border-border/50 focus:bg-background"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 状态筛选 */}
        <div className="px-3 py-2 border-b border-border/50">
          <div className="flex gap-1 p-1 bg-muted/30 rounded-lg">
            {statusFilters.map(f => (
              <button
                key={f.value}
                onClick={() => { setStatusFilter(f.value as typeof statusFilter); setPage(1) }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                  statusFilter === f.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                <f.icon className="w-3.5 h-3.5" />
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab 切换：来源/分类 */}
        <div className="border-b border-border/50">
          {/* Tab 头部 */}
          <div className="flex px-3 pt-2">
            <button
              onClick={() => setFilterTab('source')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all duration-200 -mb-px",
                filterTab === 'source'
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Rss className="w-3.5 h-3.5" />
              来源
            </button>
            <button
              onClick={() => setFilterTab('category')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all duration-200 -mb-px",
                filterTab === 'category'
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              分类
            </button>
          </div>

          {/* Tab 内容 */}
          <div className="p-3">
            {filterTab === 'source' ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => { setSourceId(''); setPage(1) }}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-full transition-all duration-200",
                    sourceId === ''
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  全部
                </button>
                {sources.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setSourceId(s.id || ''); setPage(1) }}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-full transition-all duration-200 max-w-[120px] truncate",
                      sourceId === s.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {categories.map(c => (
                  <button
                    key={c.value}
                    onClick={() => { setCategory(c.value); setPage(1) }}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-full transition-all duration-200",
                      category === c.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 统计信息 */}
        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/30 flex justify-between items-center bg-muted/20">
          <span>共 {total.toLocaleString()} 篇</span>
          <span className="opacity-60">j/k 移动 · Enter 打开</span>
        </div>

        {/* 文章列表 */}
        <div ref={listRef} className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              加载中...
            </div>
          ) : articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Newspaper className="w-8 h-8 mb-2 opacity-40" />
              <span className="text-sm">暂无文章</span>
            </div>
          ) : (
            articles.map((article, index) => (
              <div
                key={article.id}
                onClick={() => selectArticle(article, index)}
                className={cn(
                  "group px-3 py-3 border-b border-border/30 cursor-pointer transition-all duration-150",
                  article.read && "opacity-50",
                  index === focusIndex && "bg-primary/5 border-l-2 border-l-primary",
                  selectedId === article.id && "bg-primary/10",
                  index !== focusIndex && selectedId !== article.id && "hover:bg-muted/30"
                )}
              >
                <div className="flex gap-2">
                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <h3 className={cn(
                      "text-sm font-medium leading-snug line-clamp-2 transition-colors",
                      selectedId === article.id ? "text-primary" : "text-foreground group-hover:text-primary"
                    )}>
                      {article.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                        {article.source.name}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {timeAgo(article.fetchedAt || article.publishedAt || new Date().toISOString())}
                      </span>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => toggleStarred(article, e)}
                      className={cn(
                        "p-1 rounded transition-colors",
                        article.starred ? "text-amber-500 opacity-100" : "hover:text-amber-500"
                      )}
                    >
                      <Star className={cn("w-3.5 h-3.5", article.starred && "fill-current")} />
                    </button>
                    <button
                      onClick={(e) => toggleRead(article, e)}
                      className="p-1 rounded hover:text-primary transition-colors"
                    >
                      {article.read ? <BookOpenCheck className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-2 border-t border-border/50 bg-muted/20">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="h-7 px-2"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[60px] text-center">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="h-7 px-2"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    )
  }
)
