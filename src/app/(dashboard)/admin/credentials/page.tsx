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
  Edit,
  Power,
  Link,
} from "lucide-react";

interface Credential {
  domain: string;
  enabled: boolean;
  cookieLength: number;
  testUrl?: string;
  valid?: boolean;
  error?: string;
  lastChecked?: string;
  lastUpdated?: string;
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
  const [checkingDomains, setCheckingDomains] = useState<Set<string>>(new Set());
  const [checkResults, setCheckResults] = useState<Record<string, CheckResult>>({});
  
  // 添加凭证状态
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newCookie, setNewCookie] = useState("");
  const [adding, setAdding] = useState(false);

  // 更新凭证状态
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateDomain, setUpdateDomain] = useState("");
  const [updateCookie, setUpdateCookie] = useState("");
  const [updating, setUpdating] = useState(false);

  // 测试 URL 状态
  const [testUrlDialogOpen, setTestUrlDialogOpen] = useState(false);
  const [testUrlDomain, setTestUrlDomain] = useState("");
  const [testUrlValue, setTestUrlValue] = useState("");
  const [savingTestUrl, setSavingTestUrl] = useState(false);

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
    // 标记正在检测的域名
    const domainsToCheck = domain ? [domain] : credentials.map(c => c.domain);
    setCheckingDomains(prev => new Set([...prev, ...domainsToCheck]));

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
      // 移除已完成检测的域名
      setCheckingDomains(prev => {
        const next = new Set(prev);
        domainsToCheck.forEach(d => next.delete(d));
        return next;
      });
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

  // 打开更新对话框
  const openUpdateDialog = (domain: string) => {
    setUpdateDomain(domain);
    setUpdateCookie("");
    setUpdateDialogOpen(true);
  };

  // 切换凭证启用状态
  const toggleEnabled = async (domain: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/credentials/${encodeURIComponent(domain)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });

      if (res.ok) {
        loadCredentials();
      } else {
        const data = await res.json();
        alert(data.error || "操作失败");
      }
    } catch (error) {
      console.error("切换状态失败:", error);
    }
  };

  // 打开测试 URL 对话框
  const openTestUrlDialog = (domain: string, currentTestUrl?: string) => {
    setTestUrlDomain(domain);
    setTestUrlValue(currentTestUrl || "");
    setTestUrlDialogOpen(true);
  };

  // 保存测试 URL
  const handleSaveTestUrl = async () => {
    if (!testUrlDomain) return;

    setSavingTestUrl(true);
    try {
      const res = await fetch(`/api/credentials/${encodeURIComponent(testUrlDomain)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testUrl: testUrlValue }),
      });

      if (res.ok) {
        setTestUrlDialogOpen(false);
        setTestUrlDomain("");
        setTestUrlValue("");
        loadCredentials();
      } else {
        const data = await res.json();
        alert(data.error || "保存失败");
      }
    } catch (error) {
      console.error("保存测试 URL 失败:", error);
      alert("保存失败");
    } finally {
      setSavingTestUrl(false);
    }
  };

  // 更新凭证（如果不存在则自动添加）
  const handleUpdateCredential = async () => {
    if (!updateDomain || !updateCookie) return;

    setUpdating(true);
    try {
      // 先尝试 PUT 更新
      let res = await fetch(`/api/credentials/${encodeURIComponent(updateDomain)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: updateCookie }),
      });

      // 如果凭证不存在（404），则使用 POST 添加
      if (res.status === 404) {
        res = await fetch("/api/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain: updateDomain,
            cookie: updateCookie,
          }),
        });
      }

      if (res.ok) {
        setUpdateDialogOpen(false);
        setUpdateDomain("");
        setUpdateCookie("");
        // 清除该域名的检测结果，提示用户重新检测
        setCheckResults((prev) => {
          const next = { ...prev };
          delete next[updateDomain];
          return next;
        });
        loadCredentials();
      } else {
        const data = await res.json();
        alert(data.error || "操作失败");
      }
    } catch (error) {
      console.error("操作失败:", error);
      alert("操作失败");
    } finally {
      setUpdating(false);
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
            disabled={checkingDomains.size > 0}
          >
            {checkingDomains.size > 0 ? (
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
                        onClick={() => toggleEnabled(cred.domain, cred.enabled)}
                        className={cred.enabled ? "text-green-500 hover:text-green-600" : "text-gray-400 hover:text-gray-500"}
                        title={cred.enabled ? "点击禁用" : "点击启用"}
                      >
                        <Power className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => checkCredentials(cred.domain)}
                        disabled={checkingDomains.has(cred.domain)}
                        title="检测有效性"
                      >
                        <RefreshCw className={`w-4 h-4 ${checkingDomains.has(cred.domain) ? "animate-spin" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openUpdateDialog(cred.domain)}
                        title="更新 Cookie"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openTestUrlDialog(cred.domain, cred.testUrl)}
                        className={cred.testUrl ? "text-blue-500 hover:text-blue-600" : "text-gray-400 hover:text-gray-500"}
                        title={cred.testUrl ? `测试 URL: ${cred.testUrl}` : "设置测试 URL"}
                      >
                        <Link className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(`https://${cred.domain}`, "_blank")}
                        title="打开网站"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(cred.domain)}
                        title="删除"
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

      {/* 更新凭证对话框 */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>更新凭证 - {updateDomain}</DialogTitle>
            <DialogDescription>
              粘贴新的 Cookie 来更新站点凭证
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">新 Cookie</label>
              <textarea
                className="w-full h-32 px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="从浏览器 DevTools 复制的新 Cookie 字符串..."
                value={updateCookie}
                onChange={(e) => setUpdateCookie(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                打开 {updateDomain} → F12 → Application → Cookies，复制所有 Cookie
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUpdateDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleUpdateCredential}
              disabled={updating || !updateCookie}
            >
              {updating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 测试 URL 对话框 */}
      <Dialog open={testUrlDialogOpen} onOpenChange={setTestUrlDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>设置测试 URL - {testUrlDomain}</DialogTitle>
            <DialogDescription>
              设置用于检测凭证有效性的测试 URL
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">测试 URL</label>
              <Input
                placeholder="例如: https://example.com/user/profile"
                value={testUrlValue}
                onChange={(e) => setTestUrlValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                输入一个需要登录才能访问的页面 URL，用于验证 Cookie 是否有效
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTestUrlDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleSaveTestUrl}
              disabled={savingTestUrl}
            >
              {savingTestUrl && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
