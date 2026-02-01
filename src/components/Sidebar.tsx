'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Newspaper,
  Rss,
  BarChart3,
  Settings,
  Users,
  ListTodo,
  Search,
  Plus,
  RefreshCw,
} from 'lucide-react'

interface Source {
  id: string
  name: string
  type: string
  _count: { articles: number }
}

interface SidebarProps {
  sources: Source[]
  selectedSource: string | null
  onSelectSource: (id: string | null) => void
  onAddSource: () => void
  onFetchAll: () => void
  onRefresh: () => void
  onDeleteSource: (id: string) => void
  filter: 'all' | 'unread' | 'starred'
  onFilterChange: (f: 'all' | 'unread' | 'starred') => void
}

// 导航链接配置
const navLinks = [
  { href: '/dashboard', icon: Home, label: '仪表盘' },
  { href: '/articles', icon: Newspaper, label: '文章' },
  { href: '/subscriptions', icon: Rss, label: '订阅' },
  { href: '/sources', icon: Rss, label: '来源' },
  { href: '/analytics', icon: BarChart3, label: '统计' },
  { href: '/settings', icon: Settings, label: '设置' },
]

const adminLinks = [
  { href: '/admin/users', icon: Users, label: '用户' },
  { href: '/admin/tasks', icon: ListTodo, label: '任务' },
]

export function Sidebar({
  sources,
  selectedSource,
  onSelectSource,
  onAddSource,
  onFetchAll,
  onDeleteSource,
  filter,
  onFilterChange
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'bg-zinc-900 border-r border-zinc-800 flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-800">
        {!collapsed && (
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-blue-500" />
            NewsFlow
          </h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 text-zinc-400 hover:text-white"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* 搜索提示 */}
      {!collapsed && (
        <div className="px-3 py-2">
          <button
            onClick={() => {
              // 触发 Cmd+K
              const event = new KeyboardEvent('keydown', {
                key: 'k',
                metaKey: true,
                bubbles: true,
              })
              document.dispatchEvent(event)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-500 bg-zinc-800/50 rounded-md hover:bg-zinc-800 transition-colors"
          >
            <Search className="h-4 w-4" />
            <span>搜索...</span>
            <kbd className="ml-auto text-xs bg-zinc-700 px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>
        </div>
      )}

      {/* 导航链接 */}
      <ScrollArea className="flex-1">
        <nav className="p-2 space-y-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white',
                  collapsed && 'justify-center px-2'
                )}
                title={collapsed ? link.label : undefined}
              >
                <link.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{link.label}</span>}
              </Link>
            )
          })}

          <Separator className="my-2" />

          {/* 管理链接 */}
          {!collapsed && (
            <div className="px-3 py-1 text-xs font-medium text-zinc-500 uppercase">管理</div>
          )}
          {adminLinks.map((link) => {
            const isActive = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white',
                  collapsed && 'justify-center px-2'
                )}
                title={collapsed ? link.label : undefined}
              >
                <link.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{link.label}</span>}
              </Link>
            )
          })}

          {/* 过滤器 */}
          {!collapsed && (
            <>
              <Separator className="my-2" />
              <div className="px-3 py-1 text-xs font-medium text-zinc-500 uppercase">过滤</div>
              <div className="flex gap-1 px-2">
                {(['all', 'unread', 'starred'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => onFilterChange(f)}
                    className={cn(
                      'flex-1 px-2 py-1.5 text-xs rounded-md transition-colors',
                      filter === f
                        ? 'bg-blue-600 text-white'
                        : 'text-zinc-400 hover:bg-zinc-800'
                    )}
                  >
                    {f === 'all' ? '全部' : f === 'unread' ? '未读' : '收藏'}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 来源列表 */}
          {!collapsed && (
            <>
              <Separator className="my-2" />
              <div className="px-3 py-1 text-xs font-medium text-zinc-500 uppercase">来源</div>
              <button
                onClick={() => onSelectSource(null)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  selectedSource === null
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800'
                )}
              >
                全部来源
              </button>
              {sources.map((source) => (
                <div
                  key={source.id}
                  className={cn(
                    'group flex items-center rounded-md',
                    selectedSource === source.id ? 'bg-zinc-800' : 'hover:bg-zinc-800'
                  )}
                >
                  <button
                    onClick={() => onSelectSource(source.id)}
                    className={cn(
                      'flex-1 text-left px-3 py-2 text-sm flex justify-between items-center',
                      selectedSource === source.id ? 'text-white' : 'text-zinc-400'
                    )}
                  >
                    <span className="truncate">{source.name}</span>
                    <span className="text-xs text-zinc-600">{source._count.articles}</span>
                  </button>
                  <button
                    onClick={() => onDeleteSource(source.id)}
                    className="px-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除来源"
                  >
                    ×
                  </button>
                </div>
              ))}
            </>
          )}
        </nav>
      </ScrollArea>

      {/* 底部操作按钮 */}
      <div className="p-2 border-t border-zinc-800 space-y-2">
        <Button
          onClick={onFetchAll}
          variant="secondary"
          size={collapsed ? 'icon' : 'default'}
          className="w-full"
          title={collapsed ? '刷新全部' : undefined}
        >
          <RefreshCw className={cn('h-4 w-4', !collapsed && 'mr-2')} />
          {!collapsed && '刷新全部'}
        </Button>
        <Button
          onClick={onAddSource}
          size={collapsed ? 'icon' : 'default'}
          className="w-full"
          title={collapsed ? '添加来源' : undefined}
        >
          <Plus className={cn('h-4 w-4', !collapsed && 'mr-2')} />
          {!collapsed && '添加来源'}
        </Button>
      </div>
    </aside>
  )
}
