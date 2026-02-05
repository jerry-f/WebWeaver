import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchAllSources, fetchSource } from "@/lib/fetchers";

// 触发抓取（异步入队）
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { sourceId } = await req.json().catch(() => ({}));

    if (sourceId) {
      // 抓取单个源
      const result = await fetchSource(sourceId);
      return NextResponse.json({
        message: `已将信息源加入抓取队列`,
        jobId: result.jobId,
      });
    } else {
      // 抓取所有源
      const result = await fetchAllSources();
      return NextResponse.json({
        message: `已将 ${result.jobIds.length} 个信息源加入抓取队列`,
        jobIds: result.jobIds,
        count: result.jobIds.length,
      });
    }
  } catch (error) {
    console.error("Fetch error:", error);
    return NextResponse.json(
      { error: "抓取失败" },
      { status: 500 }
    );
  }
}
