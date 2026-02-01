"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, RefreshCw, ArrowLeft, ArrowRight } from "lucide-react";

interface ArticleVersion {
  title: string;
  content: string | null;
  summary: string | null;
  tags: string | null;
  category: string | null;
  imageUrl: string | null;
  author: string | null;
  publishedAt: string | null;
}

interface ArticleCompareProps {
  oldVersion: ArticleVersion;
  newVersion: ArticleVersion;
  onClose: () => void;
  onAccept: () => void;
}

export default function ArticleCompare({
  oldVersion,
  newVersion,
  onClose,
  onAccept,
}: ArticleCompareProps) {
  const [view, setView] = useState<"split" | "old" | "new">("split");

  // 解析标签
  const parseTags = (tags: string | null): string[] => {
    if (!tags) return [];
    try {
      return JSON.parse(tags);
    } catch {
      return [];
    }
  };

  // 渲染单个版本
  const renderVersion = (version: ArticleVersion, label: string, isOld: boolean) => (
    <div className={`flex-1 overflow-auto ${view === "split" ? "border-r last:border-r-0" : ""}`}>
      {/* 版本标题 */}
      <div className={`sticky top-0 z-10 px-4 py-2 border-b ${
        isOld ? "bg-red-50 dark:bg-red-950/30" : "bg-green-50 dark:bg-green-950/30"
      }`}>
        <div className="flex items-center justify-between">
          <Badge variant={isOld ? "destructive" : "default"} className="font-medium">
            {label}
          </Badge>
          {version.category && (
            <Badge variant="outline">{version.category}</Badge>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="p-4 space-y-4">
        {/* 标题 */}
        <h2 className="text-xl font-bold">{version.title}</h2>

        {/* 元信息 */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {version.author && <span>作者：{version.author}</span>}
          {version.publishedAt && (
            <span>发布：{new Date(version.publishedAt).toLocaleDateString("zh-CN")}</span>
          )}
        </div>

        {/* 封面图 */}
        {version.imageUrl && (
          <img
            src={version.imageUrl}
            alt=""
            className="w-full max-h-48 object-cover rounded-lg"
          />
        )}

        {/* 摘要 */}
        {version.summary && (
          <div className={`p-3 rounded-lg ${
            isOld ? "bg-red-50 dark:bg-red-950/20" : "bg-green-50 dark:bg-green-950/20"
          }`}>
            <div className="text-xs font-medium text-muted-foreground mb-1">AI 摘要</div>
            <p className="text-sm">{version.summary}</p>
          </div>
        )}

        {/* 标签 */}
        {version.tags && (
          <div className="flex flex-wrap gap-1">
            {parseTags(version.tags).map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* 正文内容 */}
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: version.content || "<p>暂无内容</p>" }}
        />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4 mr-2" />
            关闭对比
          </Button>

          {/* 视图切换 */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button
              variant={view === "old" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("old")}
              className="h-7 px-2"
            >
              <ArrowLeft className="w-3 h-3 mr-1" />
              旧版本
            </Button>
            <Button
              variant={view === "split" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("split")}
              className="h-7 px-2"
            >
              并排对比
            </Button>
            <Button
              variant={view === "new" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("new")}
              className="h-7 px-2"
            >
              新版本
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={onAccept}>
            <RefreshCw className="w-4 h-4 mr-2" />
            确认更新
          </Button>
        </div>
      </div>

      {/* 对比内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {(view === "split" || view === "old") && renderVersion(oldVersion, "旧版本", true)}
        {(view === "split" || view === "new") && renderVersion(newVersion, "新版本", false)}
      </div>
    </div>
  );
}
