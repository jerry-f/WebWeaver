'use client'

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
  return (
    <aside className="w-64 bg-zinc-800 border-r border-zinc-700 flex flex-col">
      <div className="p-4 border-b border-zinc-700">
        <h1 className="text-xl font-bold text-white">📰 NewsFlow</h1>
      </div>
      
      <div className="p-2 border-b border-zinc-700 flex gap-1">
        {(['all', 'unread', 'starred'] as const).map(f => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={`flex-1 px-2 py-1 text-xs rounded ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            {f === 'all' ? '全部' : f === 'unread' ? '未读' : '收藏'}
          </button>
        ))}
      </div>
      
      <nav className="flex-1 overflow-auto p-2">
        <button
          onClick={() => onSelectSource(null)}
          className={`w-full text-left px-3 py-2 rounded text-sm ${
            selectedSource === null
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          全部来源
        </button>
        
        {sources.map(source => (
          <div
            key={source.id}
            className={`group flex items-center rounded ${
              selectedSource === source.id
                ? 'bg-zinc-700'
                : 'hover:bg-zinc-700'
            }`}
          >
            <button
              onClick={() => onSelectSource(source.id)}
              className={`flex-1 text-left px-3 py-2 text-sm flex justify-between items-center ${
                selectedSource === source.id
                  ? 'text-white'
                  : 'text-zinc-300'
              }`}
            >
              <span className="truncate">{source.name}</span>
              <span className="text-xs text-zinc-500">{source._count.articles}</span>
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
      </nav>
      
      <div className="p-2 border-t border-zinc-700 space-y-2">
        <button
          onClick={onFetchAll}
          className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
        >
          🔄 刷新全部
        </button>
        <button
          onClick={onAddSource}
          className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
        >
          ➕ 添加来源
        </button>
      </div>
    </aside>
  )
}
