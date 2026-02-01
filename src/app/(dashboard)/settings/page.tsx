"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bell, Mail, MessageCircle, User } from "lucide-react";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    // TODO: 保存设置
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-muted-foreground">管理您的账户和推送偏好</p>
      </div>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            个人信息
          </CardTitle>
          <CardDescription>更新您的个人资料</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">姓名</label>
              <Input defaultValue={session?.user?.name || ""} name="name" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">邮箱</label>
              <Input
                defaultValue={session?.user?.email || ""}
                name="email"
                type="email"
                disabled
              />
              <p className="text-xs text-muted-foreground">邮箱无法修改</p>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            推送设置
          </CardTitle>
          <CardDescription>配置每日摘要推送</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Telegram */}
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <MessageCircle className="w-5 h-5 text-blue-500" />
              <div>
                <h4 className="font-medium">Telegram</h4>
                <p className="text-sm text-muted-foreground">
                  通过 Telegram Bot 接收每日摘要
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Chat ID</label>
                <Input placeholder="您的 Telegram Chat ID" />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="telegram-enabled"
                  className="rounded"
                />
                <label htmlFor="telegram-enabled" className="text-sm">
                  启用 Telegram 推送
                </label>
              </div>
            </div>
          </div>

          {/* Email */}
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <Mail className="w-5 h-5 text-red-500" />
              <div>
                <h4 className="font-medium">邮件</h4>
                <p className="text-sm text-muted-foreground">
                  通过邮件接收每日摘要
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">接收邮箱</label>
                <Input
                  type="email"
                  defaultValue={session?.user?.email || ""}
                  placeholder="your@email.com"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="email-enabled"
                  className="rounded"
                />
                <label htmlFor="email-enabled" className="text-sm">
                  启用邮件推送
                </label>
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <label className="text-sm font-medium">推送时间</label>
            <Input type="time" defaultValue="08:00" />
            <p className="text-xs text-muted-foreground">
              每天在此时间推送当日摘要
            </p>
          </div>

          <Button>保存推送设置</Button>
        </CardContent>
      </Card>
    </div>
  );
}
