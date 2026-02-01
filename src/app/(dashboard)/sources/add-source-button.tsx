"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";

const categories = [
  { value: "tech", label: "科技" },
  { value: "ai", label: "AI" },
  { value: "frontend", label: "前端" },
  { value: "backend", label: "后端" },
  { value: "investment", label: "投资" },
  { value: "news", label: "新闻" },
];

export default function AddSourceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      url: formData.get("url") as string,
      category: formData.get("category") as string,
      description: formData.get("description") as string,
    };

    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const result = await res.json();
        setError(result.error || "添加失败");
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("添加失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />
        添加信息源
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">添加信息源</h2>
          <button onClick={() => setOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">名称 *</label>
            <Input name="name" placeholder="Hacker News" required />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">RSS / 网站 URL *</label>
            <Input
              name="url"
              type="url"
              placeholder="https://hnrss.org/frontpage"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">分类 *</label>
            <select
              name="category"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">描述</label>
            <Input name="description" placeholder="可选描述" />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "添加中..." : "添加"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
