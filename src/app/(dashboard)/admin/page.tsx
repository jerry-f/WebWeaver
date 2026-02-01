import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Newspaper, Rss, Activity, Shield, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import FetchButton from "./fetch-button";

async function getAdminStats() {
  const [users, articles, sources, tasks] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.article.count(),
    prisma.source.count(),
    prisma.task.findMany({
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { users, articles, sources, tasks };
}

export default async function AdminPage() {
  const session = await auth();

  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const stats = await getAdminStats();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6" />
            后台管理
          </h1>
          <p className="text-muted-foreground">系统管理与监控</p>
        </div>
        <FetchButton />
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              用户数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{stats.users.length}</span>
              <Users className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              文章总数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{stats.articles}</span>
              <Newspaper className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              信息源
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{stats.sources}</span>
              <Rss className="w-8 h-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            用户管理
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">用户</th>
                  <th className="text-left py-3 px-4 font-medium">邮箱</th>
                  <th className="text-left py-3 px-4 font-medium">角色</th>
                  <th className="text-left py-3 px-4 font-medium">注册时间</th>
                </tr>
              </thead>
              <tbody>
                {stats.users.map((user) => (
                  <tr key={user.id} className="border-b last:border-0">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                          {user.name?.[0] || user.email[0]}
                        </div>
                        <span>{user.name || "未设置"}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {user.email}
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={user.role === "ADMIN" ? "default" : "secondary"}
                      >
                        {user.role === "ADMIN" ? "管理员" : "用户"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {formatDateTime(user.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            定时任务
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.tasks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              暂无定时任务
            </p>
          ) : (
            <div className="space-y-3">
              {stats.tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{task.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {task.schedule}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {task.lastRun && (
                      <span className="text-sm text-muted-foreground flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatDateTime(task.lastRun)}
                      </span>
                    )}
                    <Badge
                      variant={task.enabled ? "default" : "secondary"}
                    >
                      {task.enabled ? "运行中" : "已停止"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
