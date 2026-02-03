"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import SourceForm, { type SourceFormData } from "./source-form";

export default function AddSourceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (data: SourceFormData) => {
    setLoading(true);
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

  const handleCancel = () => {
    setOpen(false);
    setError("");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-8">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto scrollbar-hover">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">添加信息源</h2>
          <button onClick={handleCancel}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <SourceForm
          mode="add"
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          loading={loading}
          error={error}
          setError={setError}
        />
      </div>
    </div>
  );
}
