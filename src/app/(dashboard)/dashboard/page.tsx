import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { Newspaper, Rss, Users, TrendingUp, Clock, CheckCircle } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";

async function getStats() {
  const [articlesCount, sourcesCount, usersCount, recentArticles] = await Promise.all([
    prisma.article.count(),
    prisma.source.count(),
    prisma.user.count(),
    prisma.article.findMany({
      take: 10,
      orderBy: { fetchedAt: "desc" },
      include: { source: true },
    }),
  ]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayArticles = await prisma.article.count({
    where: { fetchedAt: { gte: todayStart } },
  });

  return {
    articlesCount,
    sourcesCount,
    usersCount,
    todayArticles,
    recentArticles,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();

  const statCards = [
    {
      title: "总文章数",
      value: stats.articlesCount,
      icon: Newspaper,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "今日新增",
      value: stats.todayArticles,
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "信息源",
      value: stats.sourcesCount,
      icon: Rss,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      title: "用户数",
      value: stats.usersCount,
      icon: Users,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
  ];

  const categoryColors: Record<string, string> = {
    tech: "bg-blue-100 text-blue-800",
    ai: "bg-purple-100 text-purple-800",
    frontend: "bg-green-100 text-green-800",
    backend: "bg-orange-100 text-orange-800",
    investment: "bg-red-100 text-red-800",
    news: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <p className="text-muted-foreground">欢迎回来，这是您的信息概览</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Articles */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>最新文章</CardTitle>
          <Link
            href="/articles"
            className="text-sm text-blue-600 hover:underline"
          >
            查看全部
          </Link>
        </CardHeader>
        <CardContent>
          {stats.recentArticles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Newspaper className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>暂无文章</p>
              <p className="text-sm">添加信息源后，系统会自动抓取文章</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stats.recentArticles.map((article) => (
                <div
                  key={article.id}
                  className="flex items-start justify-between p-4 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:text-blue-600 line-clamp-1"
                    >
                      {article.title}
                    </a>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant="secondary"
                        className={categoryColors.news}
                      >
                        {article.source.name}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatDateTime(article.fetchedAt)}
                      </span>
                    </div>
                    {article.summary && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {article.summary}
                      </p>
                    )}
                  </div>
                  {article.summary && (
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
