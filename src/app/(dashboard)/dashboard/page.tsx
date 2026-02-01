import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { Newspaper, Rss, Users, TrendingUp, Clock, Sparkles } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";

async function getStats() {
  const [articlesCount, sourcesCount, usersCount, recentArticles] = await Promise.all([
    prisma.article.count(),
    prisma.source.count(),
    prisma.user.count(),
    prisma.article.findMany({
      take: 8,
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
      gradient: "from-primary/20 to-primary/5",
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
    {
      title: "今日新增",
      value: stats.todayArticles,
      icon: TrendingUp,
      gradient: "from-accent/20 to-accent/5",
      iconBg: "bg-accent/15",
      iconColor: "text-accent",
    },
    {
      title: "信息源",
      value: stats.sourcesCount,
      icon: Rss,
      gradient: "from-chart-3/20 to-chart-3/5",
      iconBg: "bg-chart-3/15",
      iconColor: "text-chart-3",
    },
    {
      title: "用户数",
      value: stats.usersCount,
      icon: Users,
      gradient: "from-chart-4/20 to-chart-4/5",
      iconBg: "bg-chart-4/15",
      iconColor: "text-chart-4",
    },
  ];

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="space-y-1">
        <h1 className="text-3xl font-serif font-bold text-foreground">仪表盘</h1>
        <p className="text-muted-foreground">欢迎回来，这是您的信息概览</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card
            key={stat.title}
            className={`relative overflow-hidden bg-gradient-to-br ${stat.gradient} border-border/50 hover:border-border hover:shadow-lg transition-all duration-300`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2.5 rounded-xl ${stat.iconBg} shadow-sm`}>
                <stat.icon className={`w-4 h-4 ${stat.iconColor}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground tracking-tight">
                {stat.value.toLocaleString()}
              </div>
            </CardContent>
            {/* 装饰性背景圆 */}
            <div className={`absolute -right-8 -bottom-8 w-32 h-32 rounded-full ${stat.iconBg} opacity-50`} />
          </Card>
        ))}
      </div>

      {/* 最新文章 */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <CardTitle className="font-serif">最新文章</CardTitle>
          </div>
          <Link
            href="/articles"
            className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
          >
            查看全部 →
          </Link>
        </CardHeader>
        <CardContent className="pt-4">
          {stats.recentArticles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
                <Newspaper className="w-8 h-8 opacity-50" />
              </div>
              <p className="font-medium">暂无文章</p>
              <p className="text-sm mt-1">添加信息源后，系统会自动抓取文章</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {stats.recentArticles.map((article, index) => (
                <article
                  key={article.id}
                  className="group py-4 first:pt-0 last:pb-0"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-start gap-4">
                    {/* 序号 */}
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center text-sm font-medium text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      {index + 1}
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/articles?id=${article.id}`}
                        className="group/link flex items-start gap-2"
                      >
                        <h3 className="font-medium text-foreground group-hover/link:text-primary line-clamp-1 transition-colors">
                          {article.title}
                        </h3>
                      </Link>

                      <div className="flex items-center gap-3 mt-2">
                        <Badge
                          variant="secondary"
                          className="bg-secondary/80 text-secondary-foreground hover:bg-secondary font-normal"
                        >
                          {article.source.name}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDateTime(article.fetchedAt)}
                        </span>
                      </div>

                      {article.summary && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                          {article.summary}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
