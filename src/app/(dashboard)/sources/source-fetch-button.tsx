"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Check, AlertCircle, Loader2 } from "lucide-react";
import { useFetchSource } from "@/hooks/use-job-status";

interface SourceFetchButtonProps {
  sourceId: string;
  sourceName: string;
}

export default function SourceFetchButton({ sourceId, sourceName }: SourceFetchButtonProps) {
  const { fetch, isLoading, isCompleted, isFailed, status, error, reset } = useFetchSource();

  // 3秒后清除结果提示
  useEffect(() => {
    if (isCompleted || isFailed) {
      const timer = setTimeout(() => reset(), 3000);
      return () => clearTimeout(timer);
    }
  }, [isCompleted, isFailed, reset]);

  const handleFetch = () => {
    fetch(sourceId);
  };

  // 构建结果消息
  const getMessage = () => {
    if (isFailed) {
      return error || "抓取失败";
    }
    if (isCompleted && status?.progress) {
      const added = status.progress.added || 0;
      const queued = status.progress.queued || 0;
      if (added > 0) {
        return queued > 0 ? `新增 ${added} 篇，${queued} 篇待抓取` : `新增 ${added} 篇`;
      }
      return "无新文章";
    }
    if (isLoading && status?.status === "progress" && status.progress) {
      return `进度: ${status.progress.current}/${status.progress.total}`;
    }
    return null;
  };

  const message = getMessage();
  const showResult = isCompleted || isFailed;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleFetch}
        disabled={isLoading}
        title={`抓取 ${sourceName}`}
        className="h-8 px-2"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
      </Button>
      {message && (
        <span
          className={`text-xs flex items-center gap-1 ${
            isFailed ? "text-red-500" : isCompleted ? "text-green-600" : "text-muted-foreground"
          }`}
        >
          {showResult && (
            isFailed ? (
              <AlertCircle className="w-3 h-3" />
            ) : (
              <Check className="w-3 h-3" />
            )
          )}
          {message}
        </span>
      )}
    </div>
  );
}
