'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Newspaper,
  Rss,
  Users,
  BarChart3,
  Settings,
  ListTodo,
  Search,
  Home,
} from 'lucide-react'

interface Article {
  id: string
  title: string
  source: { name: string }
}

export function CommandMenu() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // 监听 Cmd+K 快捷键
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // 搜索文章
  const searchArticles = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setArticles([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/articles?q=${encodeURIComponent(query)}&limit=5`)
      const data = await res.json()
      setArticles(data.articles || [])
    } catch {
      setArticles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      searchArticles(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, searchArticles])

  const runCommand = useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  // 导航项
  const navItems = [
    { icon: Home, label: '仪表盘', href: '/dashboard' },
    { icon: Newspaper, label: '文章', href: '/articles' },
    { icon: Rss, label: '订阅管理', href: '/subscriptions' },
    { icon: Rss, label: '来源管理', href: '/sources' },
    { icon: BarChart3, label: '统计分析', href: '/analytics' },
    { icon: Settings, label: '设置', href: '/settings' },
  ]

  const adminItems = [
    { icon: Users, label: '用户管理', href: '/admin/users' },
    { icon: ListTodo, label: '任务管理', href: '/admin/tasks' },
  ]

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="搜索文章、导航..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          {loading ? '搜索中...' : '没有找到结果'}
        </CommandEmpty>

        {/* 搜索结果 */}
        {articles.length > 0 && (
          <CommandGroup heading="文章">
            {articles.map((article) => (
              <CommandItem
                key={article.id}
                value={article.title}
                onSelect={() => runCommand(() => router.push(`/articles/${article.id}`))}
              >
                <Search className="mr-2 h-4 w-4" />
                <div className="flex flex-col">
                  <span className="truncate">{article.title}</span>
                  <span className="text-xs text-zinc-500">{article.source.name}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* 导航 */}
        <CommandGroup heading="导航">
          {navItems.map((item) => (
            <CommandItem
              key={item.href}
              value={item.label}
              onSelect={() => runCommand(() => router.push(item.href))}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* 管理 */}
        <CommandGroup heading="管理">
          {adminItems.map((item) => (
            <CommandItem
              key={item.href}
              value={item.label}
              onSelect={() => runCommand(() => router.push(item.href))}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
