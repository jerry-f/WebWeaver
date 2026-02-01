'use client'

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

  return (
    <article className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* 标题 */}
        <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground leading-tight mb-4">
          {title}
        </h1>

        {/* 元信息 */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-6 pb-6 border-b border-border">
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
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            查看原文
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* 封面图 */}
        {imageUrl && (
          <div className="mb-6 rounded-lg overflow-hidden bg-muted">
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
          <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2 text-primary mb-2">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">AI 摘要</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {summary}
            </p>
          </div>
        )}

        {/* 加载状态 */}
        {contentLoading && (
          <div className="flex items-center gap-2 text-muted-foreground mb-4 p-4 bg-muted/30 rounded-lg">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在加载全文...
          </div>
        )}

        {/* 正文内容 */}
        <div
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
            __html: content || summary || '<p class="text-muted-foreground">暂无内容</p>'
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
