"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Key,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Shield,
  Copy,
  ExternalLink,
} from "lucide-react";

interface Credential {
  domain: string;
  enabled: boolean;
  cookieLength: number;
  hasTestUrl: boolean;
  valid?: boolean;
  error?: string;
  lastChecked?: string;
}

interface CheckResult {
  domain: string;
  valid: boolean;
  error?: string;
  title?: string;
  note?: string;
}

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<Record<string, CheckResult>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newCookie, setNewCookie] = useState("");
  const [adding, setAdding] = useState(false);

  // 加载凭证列表
  const loadCredentials = async () => {
    try {
      const res = await fetch("/api/credentials");
      const data = await res.json();
      setCredentials(data.credentials || []);
    } catch (error) {
      console.error("加载凭证失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 检测凭证有效性
  const checkCredentials = async (domain?: string) => {
    setChecking(true);
    try {
      const res = await fetch("/api/credentials/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(domain ? { domain } : {}),
      });
      const data = await res.json();

      // 更新检测结果
      const newResults: Record<string, CheckResult> = { ...checkResults };
      for (const result of data.results || []) {
        newResults[result.domain] = result;
      }
      setCheckResults(newResults);
    } catch (error) {
      console.error("检测失败:", error);
    } finally {
      setChecking(false);
    }
  };

  // 添加凭证
  const handleAddCredential = async () => {
    if (!newDomain || !newCookie) return;

    setAdding(true);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: newDomain,
          cookie: newCookie,
        }),
      });

      if (res.ok) {
        setAddDialogOpen(false);
        setNewDomain("");
        setNewCookie("");
        loadCredentials();
      } else {
        const data = await res.json();
        alert(data.error || "添加失败");
      }
    } catch (error) {
      console.error("添加失败:", error);
      alert("添加失败");
    } finally {
      setAdding(false);
    }
  };

  // 删除凭证
  const handleDelete = async (domain: string) => {
    if (!confirm(`确定删除 ${domain} 的凭证吗？`)) return;

    try {
      const res = await fetch(`/api/credentials/${encodeURIComponent(domain)}`, {
        method: "DELETE",
      });

      if (res.ok) {
        loadCredentials();
      }
    } catch (error) {
      console.error("删除失败:", error);
    }
  };

  useEffect(() => {
    loadCredentials();
  }, []);

  const getStatusBadge = (cred: Credential) => {
    const result = checkResults[cred.domain];

    if (result) {
      if (result.valid) {
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            有效
          </Badge>
        );
      } else {
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            失效
          </Badge>
        );
      }
    }

    if (cred.enabled) {
      return (
        <Badge variant="secondary">
          <AlertCircle className="w-3 h-3 mr-1" />
          未检测
        </Badge>
      );
    }

    return (
      <Badge variant="outline">
        未启用
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="w-6 h-6" />
            站点凭证管理
          </h1>
          <p className="text-muted-foreground">
            管理需要登录才能抓取的站点凭证
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => checkCredentials()}
            disabled={checking}
          >
            {checking ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            检测有效性
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                添加凭证
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>添加站点凭证</DialogTitle>
                <DialogDescription>
                  从浏览器复制 Cookie 来添加站点凭证
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">域名</label>
                  <Input
                    placeholder="例如: zhihu.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cookie</label>
                  <textarea
                    className="w-full h-32 px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="从浏览器 DevTools 复制的 Cookie 字符串..."
                    value={newCookie}
                    onChange={(e) => setNewCookie(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    打开浏览器 DevTools → Application → Cookies，复制所有 Cookie
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  onClick={handleAddCredential}
                  disabled={adding || !newDomain || !newCookie}
                >
                  {adding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  添加
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Instructions */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Shield className="w-8 h-8 text-blue-500 flex-shrink-0" />
            <div className="space-y-2">
              <h3 className="font-medium">如何获取 Cookie？</h3>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>在浏览器中登录目标网站（如知乎）</li>
                <li>按 F12 打开开发者工具</li>
                <li>切换到 Application（应用）标签</li>
                <li>在左侧找到 Cookies → 选择对应域名</li>
                <li>复制所有 Cookie 的 Name=Value 对，用分号分隔</li>
              </ol>
              <p className="text-xs text-muted-foreground mt-2">
                💡 提示：Cookie 会定期过期，需要重新更新
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credentials List */}
      {credentials.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Key className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无凭证</h3>
            <p className="text-muted-foreground mb-4">
              添加站点凭证以抓取需要登录的内容
            </p>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              添加第一个凭证
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {credentials.map((cred) => {
            const result = checkResults[cred.domain];
            return (
              <Card key={cred.domain}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                        {cred.domain[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{cred.domain}</h3>
                          {getStatusBadge(cred)}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span>Cookie: {cred.cookieLength} 字符</span>
                          {result?.title && (
                            <span className="text-green-600">
                              验证页面: {result.title.slice(0, 30)}...
                            </span>
                          )}
                          {result?.error && (
                            <span className="text-red-500">
                              {result.error}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => checkCredentials(cred.domain)}
                        disabled={checking}
                      >
                        <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(`https://${cred.domain}`, "_blank")}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(cred.domain)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Stats */}
      {credentials.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold">{credentials.length}</div>
                <div className="text-sm text-muted-foreground">总计站点</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-500">
                  {Object.values(checkResults).filter((r) => r.valid).length}
                </div>
                <div className="text-sm text-muted-foreground">有效凭证</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-red-500">
                  {Object.values(checkResults).filter((r) => !r.valid).length}
                </div>
                <div className="text-sm text-muted-foreground">失效凭证</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
