'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ExternalLink, Loader2, Sparkles } from 'lucide-react'

interface ArticleContentProps {
  title: string
  content?: string
  summary?: string
  author?: string
  publishedAt?: string
  url: string
  imageUrl?: string
  contentLoading: boolean
  onFetchFullContent: () => void
}

export default function ArticleContent({
  title,
  content,
  summary,
  author,
  publishedAt,
  url,
  imageUrl,
  contentLoading,
  onFetchFullContent,
}: ArticleContentProps) {
  // 格式化日期
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 为代码块添加复制按钮
  const contentRef = useRef<HTMLDivElement>(null)

  // 处理 HTML，为 pre 标签添加包装器和复制按钮
  const processedContent = (content || summary || '<p class="text-muted-foreground">暂无内容</p>')
    .replace(/<pre([^>]*)>/g, `<div class="code-block-wrapper"><button class="code-copy-btn" type="button" title="复制代码"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button><pre$1>`)
    .replace(/<\/pre>/g, '</pre></div>')

  // 事件代理处理复制按钮点击
  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    // 复制文本到剪贴板（兼容非 HTTPS 环境）
    const copyToClipboard = async (text: string): Promise<boolean> => {
      // 优先使用现代 API
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text)
          return true
        } catch {
          // 继续尝试 fallback
        }
      }
      // Fallback: 使用 execCommand
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        return true
      } catch {
        return false
      } finally {
        document.body.removeChild(textarea)
      }
    }

    const handleClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const btn = target.closest('.code-copy-btn') as HTMLButtonElement
      if (!btn) return

      const wrapper = btn.closest('.code-block-wrapper')
      const pre = wrapper?.querySelector('pre')
      const code = pre?.querySelector('code')?.textContent || pre?.textContent || ''

      const success = await copyToClipboard(code)
      if (success) {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
        btn.classList.add('copied')
        setTimeout(() => {
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
          btn.classList.remove('copied')
        }, 2000)
      } else {
        console.error('复制失败')
      }
    }

    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [])

  return (
    <article className="flex-1 overflow-auto" style={{ backgroundColor: 'var(--reading-bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* 标题 */}
        <h1 className="text-2xl md:text-3xl font-serif font-bold leading-tight mb-4" style={{ color: 'var(--reading-heading)' }}>
          {title}
        </h1>

        {/* 元信息 */}
        <div className="flex flex-wrap items-center gap-3 text-sm mb-6 pb-6" style={{ color: 'var(--reading-muted)', borderBottom: '1px solid var(--reading-border)' }}>
          {author && (
            <span className="font-medium">{author}</span>
          )}
          {publishedAt && (
            <span>{formatDate(publishedAt)}</span>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline inline-flex items-center gap-1"
            style={{ color: 'var(--reading-link)' }}
          >
            查看原文
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* 封面图 */}
        {imageUrl && (
          <div className="mb-6 rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--reading-code-bg)' }}>
            <img
              src={imageUrl}
              alt=""
              className="w-full h-auto max-h-80 object-contain"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display = 'none'
              }}
            />
          </div>
        )}

        {/* AI 摘要 */}
        {summary && (
          <div className="ai-summary mb-6 p-4 rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, var(--reading-accent) 8%, var(--reading-bg))', border: '1px solid color-mix(in srgb, var(--reading-accent) 25%, transparent)' }}>
            <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--reading-accent)' }}>
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">AI 摘要</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--reading-muted)' }}>
              {summary}
            </p>
          </div>
        )}

        {/* 加载状态 */}
        {contentLoading && (
          <div className="flex items-center gap-2 mb-4 p-4 rounded-lg" style={{ color: 'var(--reading-muted)', backgroundColor: 'var(--reading-code-bg)' }}>
            <Loader2 className="w-4 h-4 animate-spin" />
            正在加载全文...
          </div>
        )}

        {/* 正文内容 */}
        <div
          ref={contentRef}
          className="prose prose-neutral dark:prose-invert max-w-none
            prose-headings:font-serif prose-headings:text-foreground
            prose-p:text-foreground prose-p:leading-relaxed
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-strong:text-foreground
            prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:rounded
            prose-pre:bg-muted prose-pre:border prose-pre:border-border
            prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
            prose-img:rounded-lg"
          dangerouslySetInnerHTML={{
            __html: processedContent
          }}
        />

        {/* 获取全文按钮 */}
        {content && content.length < 300 && !contentLoading && (
          <Button
            onClick={onFetchFullContent}
            variant="outline"
            className="mt-6"
          >
            <Loader2 className="w-4 h-4 mr-2" />
            尝试获取全文
          </Button>
        )}

        {/* 快捷键提示 */}
        <div className="mt-12 pt-6 border-t border-border text-xs text-muted-foreground">
          <span className="font-medium">快捷键：</span>
          <span className="ml-2">Esc 返回</span>
          <span className="ml-3">j/k 上下篇</span>
          <span className="ml-3">m 切换已读</span>
          <span className="ml-3">s 切换收藏</span>
          <span className="ml-3">v 打开原文</span>
          <span className="ml-3">r 刷新内容</span>
          <span className="ml-3">b 切换列表</span>
        </div>
      </div>
    </article>
  )
}
