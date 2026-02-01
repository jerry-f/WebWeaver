"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Check, AlertCircle } from "lucide-react";

interface SourceFetchButtonProps {
  sourceId: string;
  sourceName: string;
}

export default function SourceFetchButton({ sourceId, sourceName }: SourceFetchButtonProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleFetch = async () => {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/sources/${sourceId}/fetch`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setResult({ success: false, message: data.error || "抓取失败" });
      } else {
        const added = data.added || 0;
        setResult({
          success: true,
          message: added > 0 ? `新增 ${added} 篇` : "无新文章",
        });
      }
    } catch {
      setResult({ success: false, message: "网络错误" });
    } finally {
      setLoading(false);
      // 3秒后清除结果提示
      setTimeout(() => setResult(null), 3000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleFetch}
        disabled={loading}
        title={`抓取 ${sourceName}`}
        className="h-8 px-2"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
      </Button>
      {result && (
        <span
          className={`text-xs flex items-center gap-1 ${
            result.success ? "text-green-600" : "text-red-500"
          }`}
        >
          {result.success ? (
            <Check className="w-3 h-3" />
          ) : (
            <AlertCircle className="w-3 h-3" />
          )}
          {result.message}
        </span>
      )}
    </div>
  );
}
