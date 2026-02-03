"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SourceForm, { type SourceFormData, type SourceData } from "./source-form";

interface SourceActionsMenuProps {
  source: SourceData & { id: string; enabled: boolean };
}

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
  const handleEdit = async (data: SourceFormData) => {
    setLoading(true);
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto scrollbar-hover">
          <DialogHeader>
            <DialogTitle>编辑信息源</DialogTitle>
            <DialogDescription>
              修改信息源的配置
            </DialogDescription>
          </DialogHeader>

          <SourceForm
            mode="edit"
            source={source}
            onSubmit={handleEdit}
            onCancel={() => {
              setEditOpen(false);
              setError("");
            }}
            loading={loading}
            error={error}
            setError={setError}
          />
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
