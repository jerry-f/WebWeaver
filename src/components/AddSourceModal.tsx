'use client'

import { useState } from 'react'

interface AddSourceModalProps {
  onClose: () => void
  onAdded: () => void
}

export function AddSourceModal({ onClose, onAdded }: AddSourceModalProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState('rss')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, type })
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '添加失败')
      }
      
      const source = await res.json()
      // Immediately fetch articles
      await fetch(`/api/sources/${source.id}/fetch`, { method: 'POST' })
      
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">添加新闻来源</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-700 rounded border border-zinc-600 focus:border-blue-500 focus:outline-none"
              placeholder="如：少数派"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm text-zinc-400 mb-1">类型</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-700 rounded border border-zinc-600 focus:border-blue-500 focus:outline-none"
            >
              <option value="rss">RSS</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-zinc-400 mb-1">URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-700 rounded border border-zinc-600 focus:border-blue-500 focus:outline-none"
              placeholder="https://sspai.com/feed"
              required
            />
          </div>
          
          {error && (
            <div className="text-red-400 text-sm">{error}</div>
          )}
          
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-400 hover:text-white"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
            >
              {loading ? '添加中...' : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
