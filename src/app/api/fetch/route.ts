import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchAllSources, fetchSource } from "@/lib/fetchers";

// 触发抓取
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { sourceId } = await req.json().catch(() => ({}));

    let results;
    if (sourceId) {
      // 抓取单个源
      const result = await fetchSource(sourceId);
      results = [result];
    } else {
      // 抓取所有源
      results = await fetchAllSources();
    }

    const totalNew = results.reduce((sum, r) => sum + r.added, 0);
    const errors = results.filter((r) => r.errors.length > 0);

    return NextResponse.json({
      message: `抓取完成，共获取 ${totalNew} 篇新文章`,
      results,
      summary: {
        total: results.length,
        success: results.length - errors.length,
        failed: errors.length,
        newArticles: totalNew,
      },
    });
  } catch (error) {
    console.error("Fetch error:", error);
    return NextResponse.json(
      { error: "抓取失败" },
      { status: 500 }
    );
  }
}
