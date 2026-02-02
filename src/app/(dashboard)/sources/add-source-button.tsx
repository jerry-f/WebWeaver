"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, ChevronDown, ChevronUp, Settings2 } from "lucide-react";

const categories = [
  { value: "tech", label: "科技" },
  { value: "ai", label: "AI" },
  { value: "frontend", label: "前端" },
  { value: "backend", label: "后端" },
  { value: "investment", label: "投资" },
  { value: "news", label: "新闻" },
];

const sourceTypes = [
  { value: "rss", label: "RSS 订阅源" },
  { value: "scrape", label: "网页抓取" },
];

const strategies = [
  { value: "auto", label: "自动选择（推荐）" },
  { value: "go", label: "Go Scraper（高性能）" },
  { value: "browserless", label: "浏览器渲染（JS 页面）" },
  { value: "local", label: "本地抓取（备用）" },
];

interface CredentialOption {
  domain: string;
  enabled: boolean;
}

export default function AddSourceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sourceType, setSourceType] = useState("rss");
  const [credentials, setCredentials] = useState<CredentialOption[]>([]);

  // 加载凭证列表
  useEffect(() => {
    if (open) {
      fetch("/api/credentials")
        .then(res => res.json())
        .then(data => {
          if (data.credentials) {
            setCredentials(data.credentials.filter((c: CredentialOption) => c.enabled));
          }
        })
        .catch(() => {});
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    
    // 构建配置对象
    const config: Record<string, unknown> = {
      fetch: {
        strategy: formData.get("strategy") || "auto",
        fetchFullText: formData.get("fetchFullText") === "on",
        timeout: parseInt(formData.get("timeout") as string) || 30000,
      }
    };

    // Scrape 类型需要选择器配置
    if (sourceType === "scrape") {
      const listSelector = formData.get("listSelector") as string;
      const titleSelector = formData.get("titleSelector") as string;
      const linkSelector = formData.get("linkSelector") as string;

      if (!listSelector || !titleSelector || !linkSelector) {
        setError("Scrape 类型需要配置选择器");
        setLoading(false);
        return;
      }

      config.scrape = {
        listSelector,
        titleSelector,
        linkSelector,
        contentSelector: formData.get("contentSelector") || undefined,
        imageSelector: formData.get("imageSelector") || undefined,
        authorSelector: formData.get("authorSelector") || undefined,
        dateSelector: formData.get("dateSelector") || undefined,
      };
    }

    const data = {
      name: formData.get("name") as string,
      url: formData.get("url") as string,
      type: sourceType,
      category: formData.get("category") as string,
      fetchFullText: formData.get("fetchFullText") === "on",
      config,
    };

    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const result = await res.json();
        setError(result.error || "添加失败");
        return;
      }

      setOpen(false);
      setShowAdvanced(false);
      setSourceType("rss");
      router.refresh();
    } catch {
      setError("添加失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />
        添加信息源
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-8">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">添加信息源</h2>
          <button onClick={() => { setOpen(false); setShowAdvanced(false); setSourceType("rss"); }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
              {error}
            </div>
          )}

          {/* 基本信息 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">名称 *</label>
            <Input name="name" placeholder="Hacker News" required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">类型 *</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {sourceTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {sourceType === "rss" ? "RSS URL *" : "网页 URL *"}
            </label>
            <Input
              name="url"
              type="url"
              placeholder={sourceType === "rss" ? "https://hnrss.org/frontpage" : "https://example.com/news"}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">分类 *</label>
            <select
              name="category"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* 全文抓取开关 */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              name="fetchFullText"
              id="fetchFullText"
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="fetchFullText" className="text-sm">
              启用全文抓取（访问原文获取完整内容）
            </label>
          </div>

          {/* Scrape 类型的选择器配置 */}
          {sourceType === "scrape" && (
            <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                CSS 选择器配置
              </h3>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">列表选择器 *</label>
                  <Input name="listSelector" placeholder=".article-item" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">标题选择器 *</label>
                  <Input name="titleSelector" placeholder=".title" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">链接选择器 *</label>
                  <Input name="linkSelector" placeholder="a" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">摘要选择器</label>
                  <Input name="contentSelector" placeholder=".excerpt" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">图片选择器</label>
                  <Input name="imageSelector" placeholder="img" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">作者选择器</label>
                  <Input name="authorSelector" placeholder=".author" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">日期选择器</label>
                  <Input name="dateSelector" placeholder=".date" />
                </div>
              </div>
            </div>
          )}

          {/* 高级选项 */}
          <div className="border-t pt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              高级选项
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">抓取策略</label>
                  <select
                    name="strategy"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {strategies.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Go Scraper 支持 TLS 指纹伪造，可绕过部分反爬检测
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">超时时间（毫秒）</label>
                  <Input
                    name="timeout"
                    type="number"
                    placeholder="30000"
                    defaultValue="30000"
                  />
                </div>

                {credentials.length > 0 && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      💡 已配置的站点凭证会自动注入（根据域名匹配）
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      已配置: {credentials.map(c => c.domain).join(", ")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setOpen(false); setShowAdvanced(false); setSourceType("rss"); }}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "添加中..." : "添加"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
