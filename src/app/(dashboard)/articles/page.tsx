import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { Newspaper, ExternalLink, Clock, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { timeAgo, truncate } from "@/lib/utils";
import Link from "next/link";

interface PageProps {
  searchParams: Promise<{ page?: string; category?: string; search?: string }>;
}

async function getArticles(page: number, category?: string, search?: string) {
  const limit = 20;
  const where: Record<string, unknown> = {};

  if (category) {
    where.source = { category };
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { summary: { contains: search } },
    ];
  }

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { fetchedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        source: true,
      },
    }),
    prisma.article.count({ where }),
  ]);

  return {
    articles,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

const categories = [
  { value: "", label: "全部", icon: "📰" },
  { value: "tech", label: "科技", icon: "💻" },
  { value: "ai", label: "AI", icon: "🤖" },
  { value: "frontend", label: "前端", icon: "🎨" },
  { value: "backend", label: "后端", icon: "⚙️" },
  { value: "investment", label: "投资", icon: "📈" },
];

// 使用主题感知的颜色
const categoryStyles: Record<string, { bg: string; text: string; border: string }> = {
  tech: { bg: "bg-chart-1/10", text: "text-chart-1", border: "border-chart-1/20" },
  ai: { bg: "bg-chart-2/10", text: "text-chart-2", border: "border-chart-2/20" },
  frontend: { bg: "bg-chart-3/10", text: "text-chart-3", border: "border-chart-3/20" },
  backend: { bg: "bg-chart-4/10", text: "text-chart-4", border: "border-chart-4/20" },
  investment: { bg: "bg-chart-5/10", text: "text-chart-5", border: "border-chart-5/20" },
  news: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
};

export default async function ArticlesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || "1");
  const category = params.category || "";
  const search = params.search || "";

  const { articles, pagination } = await getArticles(page, category, search);

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-serif font-bold text-foreground">文章列表</h1>
          <p className="text-muted-foreground">
            共 <span className="text-foreground font-medium">{pagination.total.toLocaleString()}</span> 篇文章
          </p>
        </div>

        {/* 分类筛选 */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-thin">
          <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          {categories.map((cat) => (
            <Link
              key={cat.value}
              href={`/articles${cat.value ? `?category=${cat.value}` : ""}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                category === cat.value
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* 文章列表 */}
      {articles.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-6">
              <Newspaper className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-serif font-medium mb-2">暂无文章</h3>
            <p className="text-muted-foreground text-center max-w-md">
              {search
                ? "没有找到匹配的文章，请尝试其他关键词"
                : "添加信息源并运行抓取任务后，文章将显示在这里"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {articles.map((article, index) => {
            const style = categoryStyles[article.category || "news"] || categoryStyles.news;

            return (
              <Card
                key={article.id}
                className="group border-border/50 hover:border-border hover:shadow-lg transition-all duration-300 overflow-hidden"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <CardContent className="p-0">
                  <div className="flex">
                    {/* 文章图片 */}
                    {article.imageUrl && (
                      <div className="hidden md:block w-48 h-36 flex-shrink-0 relative overflow-hidden bg-muted">
                        <img
                          src={article.imageUrl}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/10" />
                      </div>
                    )}

                    {/* 文章内容 */}
                    <div className="flex-1 p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          {/* 标题 */}
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group/link inline-flex items-start gap-2"
                          >
                            <h2 className="font-semibold text-lg text-foreground group-hover/link:text-primary line-clamp-2 transition-colors leading-tight">
                              {article.title}
                            </h2>
                            <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover/link:opacity-100 transition-opacity flex-shrink-0 mt-1" />
                          </a>

                          {/* 元信息 */}
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            <Badge
                              variant="secondary"
                              className={`${style.bg} ${style.text} border ${style.border} font-normal`}
                            >
                              {article.source.name}
                            </Badge>
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {timeAgo(article.fetchedAt)}
                            </span>
                            {article.author && (
                              <span className="text-sm text-muted-foreground">
                                · {article.author}
                              </span>
                            )}
                          </div>

                          {/* 摘要 */}
                          {(article.summary || article.content) && (
                            <p className="text-muted-foreground mt-3 line-clamp-2 text-sm leading-relaxed">
                              {article.summary || truncate(article.content?.replace(/<[^>]*>/g, "") || "", 200)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          {page > 1 ? (
            <Link
              href={`/articles?page=${page - 1}${category ? `&category=${category}` : ""}`}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              上一页
            </Link>
          ) : (
            <span className="flex items-center gap-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" />
              上一页
            </span>
          )}

          <div className="flex items-center gap-1 px-4 py-2 rounded-lg bg-card border border-border">
            <span className="text-primary font-medium">{page}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">{pagination.totalPages}</span>
          </div>

          {page < pagination.totalPages ? (
            <Link
              href={`/articles?page=${page + 1}${category ? `&category=${category}` : ""}`}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              下一页
              <ChevronRight className="w-4 h-4" />
            </Link>
          ) : (
            <span className="flex items-center gap-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground cursor-not-allowed">
              下一页
              <ChevronRight className="w-4 h-4" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
