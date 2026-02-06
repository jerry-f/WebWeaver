'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { X, RefreshCw, Zap, Globe, Server, Sparkles } from 'lucide-react'

export type FetchStrategy = 'go' | 'browserless' | 'local' | 'ai'
export type ParseMode = 'standard' | 'enhanced'

export interface RefreshConfig {
  strategy: FetchStrategy
  parseMode: ParseMode
}

interface RefreshConfigDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (config: RefreshConfig) => void
  loading?: boolean
}

const strategyOptions: Array<{
  value: FetchStrategy
  label: string
  description: string
  icon: React.ReactNode
}> = [
  {
    value: 'go',
    label: 'Go Scraper',
    description: '快速、高效，适合大多数网站',
    icon: <Zap className="w-4 h-4" />,
  },
  {
    value: 'browserless',
    label: '浏览器渲染',
    description: '完整渲染 JS，适合动态页面',
    icon: <Globe className="w-4 h-4" />,
  },
  {
    value: 'local',
    label: '本地抓取',
    description: '使用 Node.js 直接抓取',
    icon: <Server className="w-4 h-4" />,
  },
  {
    value: 'ai',
    label: 'AI 提取',
    description: '使用 AI 智能提取正文，适合复杂页面',
    icon: <Sparkles className="w-4 h-4" />,
  },
]

const parseModeOptions: Array<{
  value: ParseMode
  label: string
  description: string
}> = [
  {
    value: 'standard',
    label: '标准模式',
    description: '使用 Readability 提取正文',
  },
  {
    value: 'enhanced',
    label: '增强模式',
    description: '保留更多内容（如导航卡片、相关链接）',
  },
]

export default function RefreshConfigDialog({
  open,
  onClose,
  onConfirm,
  loading = false,
}: RefreshConfigDialogProps) {
  const [strategy, setStrategy] = useState<FetchStrategy>('go')
  const [parseMode, setParseMode] = useState<ParseMode>('standard')

  if (!open) return null

  const handleConfirm = () => {
    onConfirm({ strategy, parseMode })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 对话框 */}
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 标题 */}
        <h2 className="text-lg font-semibold mb-4">刷新配置</h2>

        {/* 抓取方式 */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">抓取方式</label>
          <div className="space-y-2">
            {strategyOptions.map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  strategy === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <input
                  type="radio"
                  name="strategy"
                  value={option.value}
                  checked={strategy === option.value}
                  onChange={() => setStrategy(option.value)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {option.icon}
                    <span className="font-medium">{option.label}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {option.description}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 解析模式 */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">解析模式</label>
          <div className="space-y-2">
            {parseModeOptions.map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  parseMode === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <input
                  type="radio"
                  name="parseMode"
                  value={option.value}
                  checked={parseMode === option.value}
                  onChange={() => setParseMode(option.value)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <span className="font-medium">{option.label}</span>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {option.description}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                刷新中...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                开始刷新
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
