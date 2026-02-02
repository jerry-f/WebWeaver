"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Source {
  id: string;
  name: string;
  url: string;
  type: string;
  category: string;
  enabled: boolean;
  fetchFullText: boolean;
}

interface SourceActionsMenuProps {
  source: Source;
}

const categories = [
  { value: "tech", label: "科技" },
  { value: "ai", label: "AI" },
  { value: "frontend", label: "前端" },
  { value: "backend", label: "后端" },
  { value: "investment", label: "投资" },
  { value: "news", label: "新闻" },
];

export default function SourceActionsMenu({ source }: SourceActionsMenuProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 切换启用/禁用状态
  const handleToggleEnabled = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      const res = await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !source.enabled }),
      });
      if (!res.ok) throw new Error("操作失败");
      router.refresh();
    } catch {
      setError("操作失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 删除信息源
  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sources/${source.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("删除失败");
      setDeleteOpen(false);
      router.refresh();
    } catch {
      setError("删除失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 编辑信息源
  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      url: formData.get("url") as string,
      category: formData.get("category") as string,
      fetchFullText: formData.get("fetchFullText") === "on",
    };

    try {
      const res = await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const result = await res.json();
        setError(result.error || "更新失败");
        return;
      }

      setEditOpen(false);
      router.refresh();
    } catch {
      setError("更新失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditOpen(true);
  };

  const openDeleteDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteOpen(true);
  };

  return (
    <>
      {/* 操作按钮组 */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={openEditDialog}
          title="编辑"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={handleToggleEnabled}
          disabled={loading}
          title={source.enabled ? "禁用" : "启用"}
        >
          {source.enabled ? (
            <PowerOff className="w-3.5 h-3.5" />
          ) : (
            <Power className="w-3.5 h-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-red-600"
          onClick={openDeleteDialog}
          title="删除"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* 编辑对话框 */}
      <Dialog open={editOpen} onOpenChange={(open) => {
        setEditOpen(open);
        if (!open) setError("");
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑信息源</DialogTitle>
            <DialogDescription>
              修改信息源的基本配置
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEdit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">名称</label>
              <Input name="name" defaultValue={source.name} required />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">URL</label>
              <Input
                name="url"
                type="url"
                defaultValue={source.url}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">分类</label>
              <select
                name="category"
                defaultValue={source.category}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                name="fetchFullText"
                id="editFetchFullText"
                defaultChecked={source.fetchFullText}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="editFetchFullText" className="text-sm">
                启用全文抓取
              </label>
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditOpen(false);
                  setError("");
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteOpen} onOpenChange={(open) => {
        setDeleteOpen(open);
        if (!open) setError("");
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除「{source.name}」吗？此操作不可恢复，相关文章也会被删除。
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteOpen(false);
                setError("");
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              {loading ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
