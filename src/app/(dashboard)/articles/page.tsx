import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { Newspaper, ExternalLink, Clock, Bookmark } from "lucide-react";
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
        source: { select: { name: true } },
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
  { value: "", label: "全部" },
  { value: "tech", label: "科技" },
  { value: "ai", label: "AI" },
  { value: "frontend", label: "前端" },
  { value: "backend", label: "后端" },
  { value: "investment", label: "投资" },
];

const categoryColors: Record<string, string> = {
  tech: "bg-blue-100 text-blue-800",
  ai: "bg-purple-100 text-purple-800",
  frontend: "bg-green-100 text-green-800",
  backend: "bg-orange-100 text-orange-800",
  investment: "bg-red-100 text-red-800",
  news: "bg-gray-100 text-gray-800",
};

export default async function ArticlesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || "1");
  const category = params.category || "";
  const search = params.search || "";

  const { articles, pagination } = await getArticles(page, category, search);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">文章列表</h1>
          <p className="text-muted-foreground">
            共 {pagination.total} 篇文章
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Link
              key={cat.value}
              href={`/articles${cat.value ? `?category=${cat.value}` : ""}`}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === cat.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              {cat.label}
            </Link>
          ))}
        </div>
      </div>

      {articles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Newspaper className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无文章</h3>
            <p className="text-muted-foreground text-center">
              {search
                ? "没有找到匹配的文章"
                : "添加信息源并运行抓取任务后，文章将显示在这里"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {articles.map((article) => (
            <Card key={article.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  {article.imageUrl && (
                    <div className="hidden sm:block w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                      <img
                        src={article.imageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-lg hover:text-blue-600 line-clamp-2 flex items-start gap-2"
                      >
                        {article.title}
                        <ExternalLink className="w-4 h-4 flex-shrink-0 mt-1 opacity-50" />
                      </a>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <Badge
                        variant="secondary"
                        className={categoryColors[article.category || "news"] || categoryColors.news}
                      >
                        {article.source.name}
                      </Badge>
                      <span className="text-sm text-muted-foreground flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {timeAgo(article.fetchedAt)}
                      </span>
                      {article.author && (
                        <span className="text-sm text-muted-foreground">
                          · {article.author}
                        </span>
                      )}
                    </div>

                    {article.summary ? (
                      <p className="text-muted-foreground mt-3 line-clamp-2">
                        {article.summary}
                      </p>
                    ) : article.content ? (
                      <p className="text-muted-foreground mt-3 line-clamp-2">
                        {truncate(article.content.replace(/<[^>]*>/g, ""), 200)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/articles?page=${page - 1}${category ? `&category=${category}` : ""}`}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              上一页
            </Link>
          )}
          <span className="px-4 py-2 text-muted-foreground">
            {page} / {pagination.totalPages}
          </span>
          {page < pagination.totalPages && (
            <Link
              href={`/articles?page=${page + 1}${category ? `&category=${category}` : ""}`}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              下一页
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
