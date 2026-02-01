import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import prisma from "@/lib/prisma";
import { Rss, Globe, Zap, Clock, AlertCircle } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import AddSourceButton from "./add-source-button";

async function getSources() {
  return prisma.source.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { articles: true } },
    },
  });
}

export default async function SourcesPage() {
  const sources = await getSources();

  const typeIcons = {
    RSS: Rss,
    WEB: Globe,
    API: Zap,
  };

  const categoryColors: Record<string, string> = {
    tech: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    ai: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    frontend: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    backend: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
    investment: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
    news: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  };

  const categoryLabels: Record<string, string> = {
    tech: "科技",
    ai: "AI",
    frontend: "前端",
    backend: "后端",
    investment: "投资",
    news: "新闻",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">信息源管理</h1>
          <p className="text-muted-foreground">管理您订阅的信息来源</p>
        </div>
        <AddSourceButton />
      </div>

      {sources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Rss className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无信息源</h3>
            <p className="text-muted-foreground text-center mb-4">
              添加 RSS 订阅源或网站，开始聚合您感兴趣的内容
            </p>
            <AddSourceButton />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sources.map((source) => {
            const TypeIcon = typeIcons[source.type as keyof typeof typeIcons] || Rss;
            return (
              <Card key={source.id} className="relative">
                {!source.enabled && (
                  <div className="absolute inset-0 bg-white/50 dark:bg-black/50 rounded-xl z-10 flex items-center justify-center">
                    <Badge variant="secondary">已禁用</Badge>
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                        <TypeIcon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{source.name}</CardTitle>
                        <Badge
                          variant="secondary"
                          className={`mt-1 ${categoryColors[source.category] || categoryColors.news}`}
                        >
                          {categoryLabels[source.category] || source.category}
                        </Badge>
                      </div>
                    </div>
                    {source.errorCount > 0 && (
                      <div className="flex items-center text-amber-500" title={`${source.errorCount} 次错误`}>
                        <AlertCircle className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {source.description || source.url}
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {source._count.articles} 篇文章
                    </span>
                    {source.lastFetch && (
                      <span className="text-muted-foreground flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatDateTime(source.lastFetch)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
