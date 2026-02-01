import Parser from "rss-parser";
import { prisma } from "@/lib/prisma";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "NewsFlow/1.0",
  },
});

interface FetchResult {
  sourceId: string;
  sourceName: string;
  newArticles: number;
  error?: string;
}

export async function fetchSource(sourceId: string): Promise<FetchResult> {
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
  });

  if (!source) {
    return {
      sourceId,
      sourceName: "Unknown",
      newArticles: 0,
      error: "Source not found",
    };
  }

  try {
    const feed = await parser.parseURL(source.url);
    let newArticles = 0;

    for (const item of feed.items) {
      if (!item.link) continue;

      // 检查文章是否已存在
      const existing = await prisma.article.findFirst({
        where: { url: item.link },
      });

      if (existing) continue;

      // 创建新文章
      await prisma.article.create({
        data: {
          sourceId: source.id,
          title: item.title || "无标题",
          url: item.link,
          content: item.content || item.contentSnippet || item.summary || "",
          author: item.creator || item.author || null,
          publishedAt: item.pubDate ? new Date(item.pubDate) : null,
          imageUrl: extractImage(item),
        },
      });

      newArticles++;
    }

    // 更新源的更新时间
    await prisma.source.update({
      where: { id: source.id },
      data: {
        updatedAt: new Date(),
      },
    });

    return {
      sourceId: source.id,
      sourceName: source.name,
      newArticles,
    };
  } catch (error) {
    console.error(`Error fetching ${source.name}:`, error);

    // 记录错误日志
    console.error(`Fetch error for source ${source.id}:`, error);

    return {
      sourceId: source.id,
      sourceName: source.name,
      newArticles: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function fetchAllSources(): Promise<FetchResult[]> {
  const sources = await prisma.source.findMany({
    where: { enabled: true },
  });

  const results: FetchResult[] = [];

  for (const source of sources) {
    const result = await fetchSource(source.id);
    results.push(result);
    // 添加延迟避免过快请求
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}

function extractImage(item: Record<string, unknown>): string | null {
  // 尝试从不同字段提取图片
  if (item.enclosure && typeof item.enclosure === 'object' && 'url' in item.enclosure) {
    return item.enclosure.url as string;
  }
  if (item["media:content"] && typeof item["media:content"] === 'object' && 'url' in item["media:content"]) {
    return item["media:content"].url as string;
  }
  if (item.image && typeof item.image === 'string') {
    return item.image;
  }

  // 尝试从内容中提取
  const content = (item.content || item.contentSnippet || "") as string;
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/);
  return imgMatch ? imgMatch[1] : null;
}
