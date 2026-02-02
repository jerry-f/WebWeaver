import { prisma } from "../src/lib/prisma";

const defaultSources = [
  // 科技 & AI
  {
    name: "Hacker News",
    url: "https://hnrss.org/frontpage",
    type: "RSS",
    category: "tech",
    description: "硅谷科技新闻风向标",
  },
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    type: "RSS",
    category: "tech",
    description: "科技创业新闻",
  },
  {
    name: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    type: "RSS",
    category: "tech",
    description: "科技与文化",
  },
  {
    name: "机器之心",
    url: "https://www.jiqizhixin.com/rss",
    type: "RSS",
    category: "ai",
    description: "中文 AI 领域专业媒体",
  },

  // 前端 & 开发
  {
    name: "Dev.to",
    url: "https://dev.to/feed",
    type: "RSS",
    category: "frontend",
    description: "开发者社区热门文章",
  },
  {
    name: "CSS-Tricks",
    url: "https://css-tricks.com/feed/",
    type: "RSS",
    category: "frontend",
    description: "CSS 和前端技巧",
  },
  {
    name: "JavaScript Weekly",
    url: "https://javascriptweekly.com/rss/",
    type: "RSS",
    category: "frontend",
    description: "JavaScript 周刊",
  },
  {
    name: "Node Weekly",
    url: "https://nodeweekly.com/rss/",
    type: "RSS",
    category: "backend",
    description: "Node.js 周刊",
  },

  // 中文综合
  {
    name: "V2EX",
    url: "https://www.v2ex.com/index.xml",
    type: "RSS",
    category: "tech",
    description: "创意工作者社区",
  },
  {
    name: "少数派",
    url: "https://sspai.com/feed",
    type: "RSS",
    category: "tech",
    description: "效率工具与数字生活",
  },
  {
    name: "阮一峰的网络日志",
    url: "https://www.ruanyifeng.com/blog/atom.xml",
    type: "RSS",
    category: "tech",
    description: "科技爱好者周刊作者",
  },

  // 投资 & 创业
  {
    name: "36氪",
    url: "https://36kr.com/feed",
    type: "RSS",
    category: "investment",
    description: "中文创投媒体",
  },
];

// 默认定时任务
const defaultTasks = [
  {
    name: "凭证自动刷新",
    type: "REFRESH_CREDENTIALS",
    schedule: "0 3 * * *", // 每天凌晨 3 点
    enabled: true,
  },
  {
    name: "RSS 源抓取",
    type: "FETCH",
    schedule: "0 */2 * * *", // 每 2 小时
    enabled: true,
  },
  {
    name: "过期数据清理",
    type: "CLEANUP",
    schedule: "0 4 * * 0", // 每周日凌晨 4 点
    enabled: true,
  },
];

// 默认域名限速配置
const defaultDomainLimits = [
  { domain: "*", maxConcurrent: 10, rps: 10, description: "默认配置" },
  { domain: "medium.com", maxConcurrent: 2, rps: 1, description: "严格限制" },
  { domain: "twitter.com", maxConcurrent: 1, rps: 0.5, description: "严格限制" },
  { domain: "x.com", maxConcurrent: 1, rps: 0.5, description: "严格限制" },
  { domain: "zhihu.com", maxConcurrent: 3, rps: 2, description: "中等限制" },
  { domain: "juejin.cn", maxConcurrent: 3, rps: 2, description: "中等限制" },
  { domain: "segmentfault.com", maxConcurrent: 3, rps: 2, description: "中等限制" },
  { domain: "mp.weixin.qq.com", maxConcurrent: 5, rps: 5, description: "宽松限制" },
  { domain: "weixin.qq.com", maxConcurrent: 5, rps: 5, description: "宽松限制" },
  { domain: "github.com", maxConcurrent: 5, rps: 3, description: "宽松限制" },
];

// 默认熔断配置
const defaultCircuitBreaker = {
  failThreshold: 5,      // 触发熔断的连续失败次数
  openDuration: 300,     // 熔断持续时间（秒）
  maxBackoff: 60,        // 最大退避时间（秒）
  initialBackoff: 1,     // 初始退避时间（秒）
};

async function seed() {
  console.log("🌱 Seeding database...\n");

  // 添加默认信息源
  console.log("📰 添加信息源...");
  for (const source of defaultSources) {
    try {
      const existing = await prisma.source.findFirst({
        where: { url: source.url },
      });

      if (existing) {
        console.log(`⏭️  Skip: ${source.name} (already exists)`);
        continue;
      }

      await prisma.source.create({
        data: source,
      });
      console.log(`✅ Added: ${source.name}`);
    } catch (error) {
      console.error(`❌ Failed: ${source.name}`, error);
    }
  }

  // 添加默认定时任务
  console.log("\n⏰ 添加定时任务...");
  for (const task of defaultTasks) {
    try {
      const existing = await prisma.task.findFirst({
        where: { type: task.type },
      });

      if (existing) {
        console.log(`⏭️  Skip: ${task.name} (already exists)`);
        continue;
      }

      await prisma.task.create({
        data: task,
      });
      console.log(`✅ Added: ${task.name}`);
    } catch (error) {
      console.error(`❌ Failed: ${task.name}`, error);
    }
  }

  // 添加默认域名限速配置
  console.log("\n🚦 添加域名限速配置...");
  for (const limit of defaultDomainLimits) {
    try {
      await prisma.domainRateLimit.upsert({
        where: { domain: limit.domain },
        update: {},
        create: limit,
      });
      console.log(`✅ Added: ${limit.domain}`);
    } catch (error) {
      console.error(`❌ Failed: ${limit.domain}`, error);
    }
  }

  // 添加默认熔断配置
  console.log("\n⚡ 添加熔断配置...");
  try {
    await prisma.systemConfig.upsert({
      where: { key: "circuitBreaker" },
      update: {},
      create: {
        key: "circuitBreaker",
        value: JSON.stringify(defaultCircuitBreaker),
      },
    });
    console.log("✅ Added: circuitBreaker");
  } catch (error) {
    console.error("❌ Failed: circuitBreaker", error);
  }

  console.log("\n✨ Seeding completed!");
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
