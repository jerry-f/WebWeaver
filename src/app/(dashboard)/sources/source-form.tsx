"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";

// 常量配置
export const categories = [
  { value: "tech", label: "科技" },
  { value: "ai", label: "AI" },
  { value: "frontend", label: "前端" },
  { value: "backend", label: "后端" },
  { value: "investment", label: "投资" },
  { value: "news", label: "新闻" },
];

export const sourceTypes = [
  { value: "rss", label: "RSS 订阅源" },
  { value: "scrape", label: "网页抓取" },
  { value: "sitecrawl", label: "全站爬取" },
];

export const strategies = [
  { value: "auto", label: "自动选择（推荐）" },
  { value: "go", label: "Go Scraper（高性能）" },
  { value: "browserless", label: "浏览器渲染（JS 页面）" },
  { value: "local", label: "本地抓取（备用）" },
];

// 配置类型
export interface SourceConfig {
  fetch?: {
    strategy?: string;
    fetchFullText?: boolean;
    timeout?: number;
  };
  scrape?: {
    listSelector?: string;
    titleSelector?: string;
    linkSelector?: string;
    contentSelector?: string;
    imageSelector?: string;
    authorSelector?: string;
    dateSelector?: string;
  };
  siteCrawl?: {
    maxDepth?: number;
    maxUrls?: number;
    includePatterns?: string[];
    excludePatterns?: string[];
    sameDomainOnly?: boolean;
    seedPathOnly?: boolean;
    linkSelector?: string;
    contentSelector?: string;
  };
}

// 信息源数据
export interface SourceData {
  id?: string;
  name: string;
  url: string;
  type: string;
  category: string;
  enabled?: boolean;
  fetchFullText: boolean;
  config?: string | SourceConfig;
}

// 表单提交数据
export interface SourceFormData {
  name: string;
  url: string;
  type: string;
  category: string;
  fetchFullText: boolean;
  config: SourceConfig;
}

interface SourceFormProps {
  /** 模式：添加或编辑 */
  mode: "add" | "edit";
  /** 编辑时传入现有数据 */
  source?: SourceData;
  /** 提交回调 */
  onSubmit: (data: SourceFormData) => Promise<void>;
  /** 取消回调 */
  onCancel: () => void;
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string;
  /** 设置错误 */
  setError: (error: string) => void;
}

/**
 * 信息源表单组件
 * 用于添加和编辑信息源，共用相同的表单逻辑
 */
export default function SourceForm({
  mode,
  source,
  onSubmit,
  onCancel,
  loading,
  error,
  setError,
}: SourceFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sourceType, setSourceType] = useState(source?.type || "rss");
  const [config, setConfig] = useState<SourceConfig>({});
  // 用于强制重新渲染表单，解决 defaultValue 不更新的问题
  const [configLoaded, setConfigLoaded] = useState(false);

  // 解析配置
  useEffect(() => {
    if (source?.config) {
      try {
        const parsed = typeof source.config === "string"
          ? JSON.parse(source.config)
          : source.config;
        setConfig(parsed);
        setConfigLoaded(true);
      } catch {
        setConfig({});
        setConfigLoaded(true);
      }
    } else {
      setConfigLoaded(true);
    }
    if (source?.type) {
      setSourceType(source.type);
    }
  }, [source]);

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const formData = new FormData(e.currentTarget);

    // 构建配置对象
    const newConfig: SourceConfig = {
      fetch: {
        strategy: (formData.get("strategy") as string) || "auto",
        fetchFullText: formData.get("fetchFullText") === "on",
        timeout: parseInt(formData.get("timeout") as string) || 30000,
      },
    };

    // Scrape 类型配置
    if (sourceType === "scrape") {
      const listSelector = formData.get("listSelector") as string;
      const titleSelector = formData.get("titleSelector") as string;
      const linkSelector = formData.get("linkSelector") as string;

      if (!listSelector || !titleSelector || !linkSelector) {
        setError("Scrape 类型需要配置选择器");
        return;
      }

      newConfig.scrape = {
        listSelector,
        titleSelector,
        linkSelector,
        contentSelector: (formData.get("contentSelector") as string) || undefined,
        imageSelector: (formData.get("imageSelector") as string) || undefined,
        authorSelector: (formData.get("authorSelector") as string) || undefined,
        dateSelector: (formData.get("dateSelector") as string) || undefined,
      };
    }

    // SiteCrawl 类型配置
    if (sourceType === "sitecrawl") {
      const parsePatterns = (value: FormDataEntryValue | null): string[] | undefined => {
        if (!value || typeof value !== "string") return undefined;
        const patterns = value.split("\n").map((s) => s.trim()).filter(Boolean);
        return patterns.length > 0 ? patterns : undefined;
      };

      newConfig.siteCrawl = {
        maxDepth: parseInt(formData.get("maxDepth") as string) || 3,
        maxUrls: parseInt(formData.get("maxUrls") as string) || 1000,
        includePatterns: parsePatterns(formData.get("includePatterns")),
        excludePatterns: parsePatterns(formData.get("excludePatterns")),
        sameDomainOnly: formData.get("sameDomainOnly") === "on",
        seedPathOnly: formData.get("seedPathOnly") === "on",
        linkSelector: (formData.get("crawlLinkSelector") as string) || undefined,
        contentSelector: (formData.get("crawlContentSelector") as string) || undefined,
      };
    }

    const data = {
      name: formData.get("name") as string,
      url: formData.get("url") as string,
      type: sourceType,
      category: formData.get("category") as string,
      fetchFullText: formData.get("fetchFullText") === "on",
      // Prisma 期望 config 是字符串类型
      config: JSON.stringify(newConfig),
    };

    await onSubmit(data as unknown as SourceFormData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
          {error}
        </div>
      )}

      {/* 基本信息 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">名称 *</label>
        <Input
          name="name"
          defaultValue={source?.name}
          placeholder="Hacker News"
          required
        />
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
          {sourceType === "rss"
            ? "RSS URL *"
            : sourceType === "scrape"
            ? "网页 URL *"
            : "种子 URL *"}
        </label>
        <Input
          name="url"
          type="url"
          defaultValue={source?.url}
          placeholder={
            sourceType === "rss"
              ? "https://hnrss.org/frontpage"
              : sourceType === "scrape"
              ? "https://example.com/news"
              : "https://docs.example.com"
          }
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">分类 *</label>
        <select
          name="category"
          defaultValue={source?.category || "tech"}
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
          defaultChecked={source?.fetchFullText || config.fetch?.fetchFullText}
          className="h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor="fetchFullText" className="text-sm">
          启用全文抓取（访问原文获取完整内容）
        </label>
      </div>

      {/* Scrape 类型的选择器配置 */}
      {sourceType === "scrape" && configLoaded && (
        <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            CSS 选择器配置
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">列表选择器 *</label>
              <Input
                name="listSelector"
                defaultValue={config.scrape?.listSelector}
                placeholder=".article-item"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">标题选择器 *</label>
              <Input
                name="titleSelector"
                defaultValue={config.scrape?.titleSelector}
                placeholder=".title"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">链接选择器 *</label>
              <Input
                name="linkSelector"
                defaultValue={config.scrape?.linkSelector}
                placeholder="a"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">摘要选择器</label>
              <Input
                name="contentSelector"
                defaultValue={config.scrape?.contentSelector}
                placeholder=".excerpt"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">图片选择器</label>
              <Input
                name="imageSelector"
                defaultValue={config.scrape?.imageSelector}
                placeholder="img"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">作者选择器</label>
              <Input
                name="authorSelector"
                defaultValue={config.scrape?.authorSelector}
                placeholder=".author"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">日期选择器</label>
              <Input
                name="dateSelector"
                defaultValue={config.scrape?.dateSelector}
                placeholder=".date"
              />
            </div>
          </div>
        </div>
      )}

      {/* SiteCrawl 类型的配置 */}
      {sourceType === "sitecrawl" && configLoaded && (
        <div
          key={JSON.stringify(config.siteCrawl)}
          className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg"
        >
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            全站爬取配置
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">最大深度</label>
              <Input
                name="maxDepth"
                type="number"
                defaultValue={config.siteCrawl?.maxDepth || 3}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">最大 URL 数</label>
              <Input
                name="maxUrls"
                type="number"
                defaultValue={config.siteCrawl?.maxUrls || 1000}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-muted-foreground">
                包含规则（正则，每行一个）
              </label>
              <textarea
                name="includePatterns"
                defaultValue={config.siteCrawl?.includePatterns?.join("\n") || ""}
                placeholder={"/docs/\n/guide/"}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-muted-foreground">
                排除规则（正则，每行一个）
              </label>
              <textarea
                name="excludePatterns"
                defaultValue={config.siteCrawl?.excludePatterns?.join("\n") || ""}
                placeholder={"/api/\n/login\n\\?page="}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">链接选择器（可选）</label>
              <Input
                name="crawlLinkSelector"
                defaultValue={config.siteCrawl?.linkSelector}
                placeholder="a[href]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                内容区域选择器（可选）
              </label>
              <Input
                name="crawlContentSelector"
                defaultValue={config.siteCrawl?.contentSelector}
                placeholder="main, .content"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              name="sameDomainOnly"
              id="sameDomainOnly"
              defaultChecked={config.siteCrawl?.sameDomainOnly !== false}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="sameDomainOnly" className="text-sm">
              仅爬取同域名页面
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              name="seedPathOnly"
              id="seedPathOnly"
              defaultChecked={config.siteCrawl?.seedPathOnly === true}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="seedPathOnly" className="text-sm">
              仅爬取种子路径前缀（如种子为 /docs/zh-CN，则只爬取该路径下的页面）
            </label>
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
          {showAdvanced ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          高级选项
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">抓取策略</label>
              <select
                name="strategy"
                defaultValue={config.fetch?.strategy || "auto"}
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
                defaultValue={config.fetch?.timeout || 30000}
              />
            </div>
          </div>
        )}
      </div>

      {/* 按钮 */}
      <div className="flex justify-end space-x-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? (mode === "add" ? "添加中..." : "保存中...") : (mode === "add" ? "添加" : "保存")}
        </Button>
      </div>
    </form>
  );
}
