'use client'

import { useState, useCallback, useRef, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  Filter,
  ChevronDown
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

function ArticlesContent() {
  const router = useRouter()
  const listRef = useRef<HTMLDivElement>(null)

  // 数据状态
  const [articles, setArticles] = useState<Article[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [focusIndex, setFocusIndex] = useState(0)

  // 筛选状态
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'starred'>('all')
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // 筛选面板展开状态
  const [filterExpanded, setFilterExpanded] = useState(false)

  // 计算当前激活的筛选数量
  const activeFilterCount = selectedSourceIds.length + selectedCategories.length

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
    if (selectedCategories.length > 0) params.set('category', selectedCategories.join(','))
    if (selectedSourceIds.length > 0) params.set('sourceId', selectedSourceIds.join(','))
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
  }, [page, statusFilter, selectedCategories, selectedSourceIds, search])

  useEffect(() => {
    const timer = setTimeout(fetchArticles, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchArticles, search])

  // 清除所有筛选
  const clearFilters = useCallback(() => {
    setSelectedSourceIds([])
    setSelectedCategories([])
    setPage(1)
  }, [])

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

  // 选择文章 - 跳转到详情页
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

    // 跳转到详情页
    router.push(`/article-detail/${article.id}`)
  }, [router])

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
        case '/':
          e.preventDefault()
          document.getElementById('search-input')?.focus()
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

  // 获取当前选中来源的名称列表
  const selectedSourceNames = sources.filter(s => selectedSourceIds.includes(s.id || '')).map(s => s.name)
  // 获取当前选中分类的名称列表
  const selectedCategoryNames = categories.filter(c => selectedCategories.includes(c.value)).map(c => c.label)

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-4 lg:-m-6 overflow-hidden bg-background">
      {/* 紧凑的顶部工具栏 */}
      <div className="flex-shrink-0 border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-2.5">
          {/* 第一行：搜索 + 状态筛选 */}
          <div className="flex items-center gap-3">
            {/* 搜索框 */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
              <input
                id="search-input"
                type="text"
                placeholder="搜索文章... (按 / 聚焦)"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="w-full h-8 pl-8 pr-8 text-sm bg-muted/40 border-0 rounded-md placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:bg-background transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 分隔线 */}
            <div className="w-px h-5 bg-border/50" />

            {/* 状态筛选 */}
            <div className="flex items-center gap-0.5">
              {statusFilters.map(f => (
                <button
                  key={f.value}
                  onClick={() => { setStatusFilter(f.value as typeof statusFilter); setPage(1) }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all",
                    statusFilter === f.value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <f.icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{f.label}</span>
                </button>
              ))}
            </div>

            {/* 分隔线 */}
            <div className="w-px h-5 bg-border/50" />

            {/* 筛选按钮 */}
            <button
              onClick={() => setFilterExpanded(!filterExpanded)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all",
                filterExpanded || activeFilterCount > 0
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Filter className="w-3 h-3" />
              <span>筛选</span>
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-primary text-primary-foreground rounded-full">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className={cn("w-3 h-3 transition-transform", filterExpanded && "rotate-180")} />
            </button>
          </div>

          {/* 展开的筛选面板 */}
          <div className={cn(
            "grid transition-all duration-200 ease-out",
            filterExpanded ? "grid-rows-[1fr] opacity-100 mt-2.5" : "grid-rows-[0fr] opacity-0"
          )}>
            <div className="overflow-hidden">
              <div className="flex flex-wrap items-start gap-4 py-2 px-1">
                {/* 来源筛选 - 多选 */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium w-8">来源</span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => { setSelectedSourceIds([]); setPage(1) }}
                      className={cn(
                        "px-2 py-0.5 text-[11px] rounded transition-all",
                        selectedSourceIds.length === 0
                          ? "bg-foreground text-background font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      全部
                    </button>
                    {sources.map(s => {
                      const isSelected = selectedSourceIds.includes(s.id || '')
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedSourceIds(prev => prev.filter(id => id !== s.id))
                            } else {
                              setSelectedSourceIds(prev => [...prev, s.id || ''])
                            }
                            setPage(1)
                          }}
                          className={cn(
                            "px-2 py-0.5 text-[11px] rounded transition-all max-w-[100px] truncate",
                            isSelected
                              ? "bg-foreground text-background font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          )}
                        >
                          {s.name}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 分类筛选 - 多选 */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium w-8">分类</span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => { setSelectedCategories([]); setPage(1) }}
                      className={cn(
                        "px-2 py-0.5 text-[11px] rounded transition-all",
                        selectedCategories.length === 0
                          ? "bg-foreground text-background font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      全部
                    </button>
                    {categories.filter(c => c.value !== '').map(c => {
                      const isSelected = selectedCategories.includes(c.value)
                      return (
                        <button
                          key={c.value}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedCategories(prev => prev.filter(v => v !== c.value))
                            } else {
                              setSelectedCategories(prev => [...prev, c.value])
                            }
                            setPage(1)
                          }}
                          className={cn(
                            "px-2 py-0.5 text-[11px] rounded transition-all",
                            isSelected
                              ? "bg-foreground text-background font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          )}
                        >
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 清除筛选 */}
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3 h-3" />
                    清除筛选
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 激活的筛选标签（收起时显示） */}
          {!filterExpanded && activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {selectedSourceNames.map((name, idx) => (
                <span key={`source-${idx}`} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-primary/10 text-primary rounded">
                  {name}
                  <button
                    onClick={() => {
                      const sourceToRemove = sources.find(s => s.name === name)
                      if (sourceToRemove) {
                        setSelectedSourceIds(prev => prev.filter(id => id !== sourceToRemove.id))
                        setPage(1)
                      }
                    }}
                    className="hover:text-primary/70"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {selectedCategoryNames.map((name, idx) => (
                <span key={`cat-${idx}`} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-primary/10 text-primary rounded">
                  {name}
                  <button
                    onClick={() => {
                      const catToRemove = categories.find(c => c.label === name)
                      if (catToRemove) {
                        setSelectedCategories(prev => prev.filter(v => v !== catToRemove.value))
                        setPage(1)
                      }
                    }}
                    className="hover:text-primary/70"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 文章列表 */}
      <div ref={listRef} className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              加载中...
            </div>
          ) : articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Newspaper className="w-10 h-10 mb-3 opacity-30" />
              <span className="text-sm">暂无文章</span>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="mt-2 text-xs text-primary hover:underline"
                >
                  清除筛选条件
                </button>
              )}
            </div>
          ) : (
            articles.map((article, index) => (
              <div
                key={article.id}
                onClick={() => selectArticle(article, index)}
                className={cn(
                  "group px-4 py-3.5 border-b border-border/30 cursor-pointer transition-all duration-150",
                  article.read && "opacity-55",
                  index === focusIndex && "bg-primary/5 border-l-2 border-l-primary -ml-[2px] pl-[calc(1rem+2px)]",
                  index !== focusIndex && "hover:bg-muted/30"
                )}
              >
                <div className="flex gap-3">
                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <h3 className={cn(
                      "text-[15px] font-medium leading-snug line-clamp-2 transition-colors",
                      "text-foreground group-hover:text-primary"
                    )}>
                      {article.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal bg-muted/50">
                        {article.source.name}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground/70 flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {timeAgo(article.fetchedAt || article.publishedAt || new Date().toISOString())}
                      </span>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => toggleStarred(article, e)}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        article.starred ? "text-amber-500 opacity-100" : "hover:text-amber-500 hover:bg-muted/50"
                      )}
                    >
                      <Star className={cn("w-4 h-4", article.starred && "fill-current")} />
                    </button>
                    <button
                      onClick={(e) => toggleRead(article, e)}
                      className="p-1.5 rounded-md hover:text-primary hover:bg-muted/50 transition-colors"
                    >
                      {article.read ? <BookOpenCheck className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* 收藏标记（始终可见） */}
                  {article.starred && (
                    <div className="flex-shrink-0 group-hover:hidden">
                      <Star className="w-4 h-4 text-amber-500 fill-current" />
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 底部栏：统计信息 + 分页 */}
      <div className="flex-shrink-0 border-t border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-1.5 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground/70">
            {total.toLocaleString()} 篇文章
            <span className="hidden sm:inline ml-3 opacity-70">j/k 导航 · Enter 打开 · / 搜索</span>
          </span>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-6 w-6 p-0"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-[11px] text-muted-foreground min-w-[50px] text-center">
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-6 w-6 p-0"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
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
