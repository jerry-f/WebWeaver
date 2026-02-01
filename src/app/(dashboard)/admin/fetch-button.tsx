"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export default function FetchButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleFetch = async () => {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/fetch", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok) {
        setResult(`✅ ${data.message}`);
        router.refresh();
      } else {
        setResult(`❌ ${data.error}`);
      }
    } catch {
      setResult("❌ 抓取失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className="text-sm">{result}</span>
      )}
      <Button onClick={handleFetch} disabled={loading}>
        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
        {loading ? "抓取中..." : "立即抓取"}
      </Button>
    </div>
  );
}
