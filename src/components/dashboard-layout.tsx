"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Newspaper,
  Rss,
  Settings,
  Shield,
  LogOut,
  Menu,
  X,
  BarChart3,
  Users,
  ListTodo,
  BookOpen,
  PanelLeftClose,
  PanelLeft,
  Key,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const navigation = [
  { name: "仪表盘", href: "/dashboard", icon: LayoutDashboard },
  { name: "文章列表", href: "/articles", icon: Newspaper },
  { name: "订阅管理", href: "/subscriptions", icon: BookOpen },
  { name: "信息源", href: "/sources", icon: Rss },
  { name: "统计分析", href: "/analytics", icon: BarChart3 },
  { name: "设置", href: "/settings", icon: Settings },
];

const adminNavigation = [
  { name: "后台管理", href: "/admin", icon: Shield },
  { name: "用户管理", href: "/admin/users", icon: Users },
  { name: "任务管理", href: "/admin/tasks", icon: ListTodo },
  { name: "凭证管理", href: "/admin/credentials", icon: Key },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isAdmin = session?.user?.role === "admin";
  const allNavigation = isAdmin
    ? [...navigation, ...adminNavigation]
    : navigation;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 transform bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          sidebarCollapsed ? "lg:w-16" : "lg:w-64",
          "w-64"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex h-14 items-center border-b border-sidebar-border transition-all duration-300",
          sidebarCollapsed ? "justify-center px-2" : "justify-between px-6"
        )}>
          <Link href="/dashboard" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow flex-shrink-0">
              <Newspaper className="w-5 h-5 text-primary-foreground" />
            </div>
            {!sidebarCollapsed && (
              <span className="text-xl font-serif font-bold text-foreground">
                NewsFlow
              </span>
            )}
          </Link>
          <button
            className="lg:hidden p-1 rounded-md hover:bg-secondary transition-colors"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Navigation */}
        <nav className={cn(
          "flex-1 py-4 space-y-1 overflow-y-auto scrollbar-thin transition-all duration-300",
          sidebarCollapsed ? "px-2" : "px-3"
        )}>
          {allNavigation.map((item) => {
            // 特殊处理：如果有子路由在导航中，父路由只匹配精确路径
            const hasChildInNav = allNavigation.some(
              nav => nav.href !== item.href && nav.href.startsWith(item.href + '/')
            );
            const isActive = hasChildInNav
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                title={sidebarCollapsed ? item.name : undefined}
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                  sidebarCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                  isActive
                    ? "bg-primary/10 text-primary border-l-2 border-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  isActive && !sidebarCollapsed && "pl-[10px]"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5 flex-shrink-0",
                  isActive && "text-primary",
                  !sidebarCollapsed && "mr-3"
                )} />
                {!sidebarCollapsed && item.name}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle button - desktop only */}
        <div className="hidden lg:flex justify-center py-2 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed(prev => !prev)}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* User section */}
        <div className={cn(
          "border-t border-sidebar-border transition-all duration-300",
          sidebarCollapsed ? "p-2" : "p-4"
        )}>
          {sidebarCollapsed ? (
            // 折叠状态：只显示头像
            <div className="flex flex-col items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground text-sm font-semibold shadow-md">
                {session?.user?.name?.[0] || session?.user?.email?.[0] || "U"}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => signOut({ callbackUrl: `${window.location.origin}/login` })}
                title="退出登录"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            // 展开状态：显示完整信息
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground text-sm font-semibold shadow-md">
                {session?.user?.name?.[0] || session?.user?.email?.[0] || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {session?.user?.name || "用户"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {session?.user?.email}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => signOut({ callbackUrl: `${window.location.origin}/login` })}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className={cn(
        "min-h-screen flex flex-col transition-all duration-300",
        sidebarCollapsed ? "lg:pl-16" : "lg:pl-64"
      )}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 backdrop-blur-md px-4 lg:px-6">
          <button
            className="lg:hidden p-2 rounded-md hover:bg-secondary transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>

          <div className="flex-1" />

          <div className="flex items-center space-x-3">
            <span className="hidden sm:block text-sm text-muted-foreground">
              {new Date().toLocaleDateString("zh-CN", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <ThemeToggle />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
