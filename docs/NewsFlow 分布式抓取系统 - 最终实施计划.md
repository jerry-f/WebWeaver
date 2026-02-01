# NewsFlow 分布式抓取系统 - 最终实施计划

> 融合 Claude Plan + 用户多方调研精华

## 一、核心设计原则

### 🎯 关键洞察

| 洞察 | 说明 | 收益 |
|------|------|------|
| **TLS 指纹伪造** | cycletls 模拟 Chrome JA3 指纹 | 减少 90% Playwright 调用 |
| **控制/数据平面分离** | 决策轻量，重活拆开 | 独立扩展，故障隔离 |
| **QualityScore 驱动** | 先抓取、评估、按需升级 | 避免过度渲染 |
| **域名级调度** | 并发/限速/退避/熔断 | 防封核心 |
| **分层图片缓存** | Varnish(C级) + Redis + 磁盘 | 极致性能 |

### 性能目标

| 指标 | 当前 | 目标 |
|------|------|------|
| 静态抓取 QPS | ~50/s | **~1000/s** |
| 动态抓取 QPS | ~5/s | **~50/s** |
| 图片代理 QPS | N/A | **~5000/s** |
| Playwright 调用比例 | 100% | **~10%** |

## 二、最终架构：Scrape Fabric

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    控制平面 (Control Plane)                              │
│                                      NewsFlow Next.js                                    │
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│   │  • Job 调度 (BullMQ)           • 规则管理 (domain rules)                        │  │
│   │  • 优先级 (quick vs full)      • 成本预算 (Playwright/AI token)                 │  │
│   │  • 域名级限速/熔断              • 指标观测 (任务耗时、命中率)                     │  │
│   └─────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │ HTTP / gRPC
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    数据平面 (Data Plane)                                 │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              消息队列 (Redis Streams)                            │   │
│  │   fetch_tasks ──┬──► quick_fetch (90%)    enhance_tasks ───► ai_tasks (按需)    │   │
│  │                 └──► render_fetch (10%)                                         │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                            │                                            │
│       ┌────────────────────────────────────┼────────────────────────────────────┐       │
│       ▼                                    ▼                                    ▼       │
│  ┌─────────────────┐              ┌─────────────────┐              ┌─────────────────┐ │
│  │  ⚡ fetchd (Go)  │              │ 🌐 renderd      │              │ 🖼️ mediad       │ │
│  │                 │              │   (Browserless) │              │  (imgproxy)     │ │
│  │ • TLS 指纹伪造   │   fallback   │                 │              │                 │ │
│  │   (cycletls)    │ ──────────► │ • 浏览器池       │              │ • 防盗链绕过     │ │
│  │ • 连接池复用    │              │ • 资源拦截       │              │ • WebP/AVIF     │ │
│  │ • 域名并发控制   │              │ • 滚动加载       │              │ • 签名 URL      │ │
│  │                 │              │                 │              │                 │ │
│  │ 扩容: 2-N 实例   │              │ 扩容: 1-2 实例   │              │ 扩容: 1 实例    │ │
│  │ 内存: 128MB/实例 │              │ 内存: 2GB/实例   │              │ 内存: 256MB    │ │
│  └────────┬────────┘              └────────┬────────┘              └─────────────────┘ │
│           │                                │                                            │
│           └────────────────┬───────────────┘                                            │
│                            ▼                                                            │
│                   ┌─────────────────┐                                                   │
│                   │ 📄 extractd (Go) │                                                   │
│                   │                 │                                                   │
│                   │ • go-readability│                                                   │
│                   │ • bluemonday    │                                                   │
│                   │ • 懒加载修复    │                                                   │
│                   │ • QualityScore  │                                                   │
│                   └────────┬────────┘                                                   │
│                            ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                         缓存层 (Varnish + Redis)                                 │   │
│  │   Varnish (C级内存) → Redis 热缓存 → 本地磁盘 → S3/MinIO                         │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 组件选型最终决策

| 组件 | 选型 | 理由 |
|------|------|------|
| **fetchd** | Go + cycletls | TLS 指纹伪造，减少 90% 渲染需求 |
| **extractd** | Go (go-readability + bluemonday) | CPU 密集，Go 内存控制好 |
| **renderd** | Browserless (Docker) | 开箱即用，成熟稳定 |
| **mediad** | imgproxy + Varnish | 1000 req/200MB + C级缓存 |
| **队列** | Redis Streams + BullMQ | 轻量，Go/Node 都能用 |

## 三、独立服务设计

### 3.1 Go 抓取服务（核心性能服务）

**为什么用 Go？**
- 比 Python 快约 **5-10 倍**
- 比 Node.js 快约 **30-50%**
- 原生 goroutine 支持高并发
- 单二进制部署，无依赖

**技术栈：**
```
go-scraper-service/
├── cmd/
│   └── server/main.go          # gRPC + HTTP 服务入口
├── internal/
│   ├── fetcher/
│   │   ├── http_client.go      # 高性能 HTTP 客户端（连接池）
│   │   └── fetcher.go          # 抓取逻辑
│   ├── extractor/
│   │   ├── readability.go      # go-readability 正文提取
│   │   └── sanitizer.go        # bluemonday HTML 净化
│   ├── processor/
│   │   └── image.go            # 图片懒加载处理
│   └── queue/
│       └── redis.go            # Redis 任务消费
├── api/
│   └── proto/scraper.proto     # gRPC 接口定义
├── Dockerfile
└── go.mod
```

**核心依赖：**
```go
// go.mod
require (
    github.com/gocolly/colly/v2    // 爬虫框架
    github.com/go-shiori/go-readability // 正文提取
    github.com/microcosm-cc/bluemonday  // HTML 净化
    github.com/PuerkitoBio/goquery     // HTML 解析
    google.golang.org/grpc             // gRPC 通信
)
```

### 3.2 imgproxy（图片代理服务）

**为什么用 imgproxy？**
- Go + libvips，极致性能
- **1000 请求仅需 200MB RAM**
- 支持格式转换（WebP/AVIF）
- 防盗链绕过（自定义 Referer）
- 图片缓存和 CDN 友好

**部署方式：**
```yaml
# docker-compose.yml
imgproxy:
  image: darthsim/imgproxy:latest
  environment:
    IMGPROXY_BIND: ":8080"
    IMGPROXY_LOCAL_FILESYSTEM_ROOT: /images
    IMGPROXY_USE_ETAG: "true"
    IMGPROXY_CACHE_CONTROL_PASSTHROUGH: "true"
    # 签名密钥（安全）
    IMGPROXY_KEY: ${IMGPROXY_KEY}
    IMGPROXY_SALT: ${IMGPROXY_SALT}
  ports:
    - "8888:8080"
  volumes:
    - ./cache/images:/images
```

### 3.3 Browserless（动态渲染服务）

**为什么独立部署？**
- 浏览器资源消耗大（每实例 100-500MB）
- 需要独立扩展
- 支持浏览器池复用

**部署方式：**
```yaml
# docker-compose.yml
browserless:
  image: browserless/chrome:latest
  environment:
    MAX_CONCURRENT_SESSIONS: 10
    CONNECTION_TIMEOUT: 60000
    MAX_QUEUE_LENGTH: 100
    PREBOOT_CHROME: "true"
    KEEP_ALIVE: "true"
  ports:
    - "3300:3000"
  deploy:
    resources:
      limits:
        memory: 2G
```

### 3.4 NewsFlow 主应用（Node.js）

**职责简化：**
- Web UI 渲染
- API 网关
- 任务调度（BullMQ）
- 结果存储

**文件结构：**
```
src/lib/fetchers/
├── index.ts                    # 入口（调用远程服务）
├── types.ts                    # 类型定义
├── config.ts                   # 配置
├── rss.ts                      # RSS 解析（保留，轻量）
├── scrape.ts                   # 保留
│
├── clients/                    # 新增：远程服务客户端
│   ├── go-scraper-client.ts    # Go 抓取服务客户端
│   ├── imgproxy-client.ts      # imgproxy URL 生成
│   └── browserless-client.ts   # Browserless 客户端
│
└── pipeline/                   # 管道编排（调用远程服务）
    ├── index.ts
    └── presets.ts
```

## 四、处理流程与管道模式

### 4.1 多级处理管道

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            文章抓取处理流程                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  阶段1: 快速入库（毫秒级）                                                   │
│  ┌─────────────┐                                                            │
│  │ RSS/列表抓取 │ → 基础信息入库 → contentStatus: 'pending'                  │
│  └─────────────┘                                                            │
│         │                                                                   │
│         ▼                                                                   │
│  阶段2: 内容增强（后台队列，秒级）                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        BullMQ 任务队列                               │   │
│  │  ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────┐ │   │
│  │  │ 全文抓取 │ →  │ Go 服务处理  │ →  │  图片处理   │ →  │ AI 摘要  │ │   │
│  │  │ 任务    │    │ (正文+净化) │    │ (imgproxy) │    │ (可选)   │ │   │
│  │  └─────────┘    └─────────────┘    └─────────────┘    └──────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│         │                                                                   │
│         ▼                                                                   │
│  阶段3: 策略选择                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  needsPlaywright(url)?                                              │   │
│  │       │                                                              │   │
│  │       ├─ 否 → Go 抓取服务（快速，1000+ 页/分钟）                      │   │
│  │       │                                                              │   │
│  │       └─ 是 → Browserless（JS渲染，50-200 页/分钟）                  │   │
│  │              ↓                                                       │   │
│  │         Go 服务处理结果                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 管道模式配置

| 模式 | 策略 | 处理器 | 性能 | 适用场景 |
|------|------|--------|------|----------|
| `fast` | Go HTTP | readability + sanitize | ⚡⚡⚡⚡⚡ | 静态网站、RSS 全文 |
| `standard` | Go HTTP (fallback Browserless) | 全部处理器 | ⚡⚡⚡⚡ | 大多数网站 |
| `full` | Browserless | 全部 + 滚动加载 | ⚡⚡ | 复杂 SPA |
| `ai-enhanced` | 任意 + AI | 全部 + AI 清理 | ⚡ | 需要 AI 优化 |

### 4.3 智能回退机制

```typescript
// 内容质量检测，决定是否回退到 Browserless
function shouldFallback(result: FetchResult): boolean {
  // 1. 内容太短
  if (result.textContent.length < 500) return true

  // 2. 检测到 SPA 框架空壳
  const spaIndicators = [
    '<div id="root"></div>',
    '<div id="app"></div>',
    '<div id="__next"></div>',
    'window.__INITIAL_STATE__'
  ]
  if (spaIndicators.some(i => result.html.includes(i))) return true

  // 3. Readability 提取失败
  if (!result.title || result.title === 'Untitled') return true

  return false
}
```

## 五、服务通信协议

### 5.1 gRPC 接口定义（Go 抓取服务）

```protobuf
// api/proto/scraper.proto
syntax = "proto3";
package scraper;

service ScraperService {
  // 抓取并提取文章内容
  rpc FetchArticle(FetchRequest) returns (FetchResponse);

  // 批量抓取
  rpc FetchArticles(stream FetchRequest) returns (stream FetchResponse);

  // 健康检查
  rpc HealthCheck(Empty) returns (HealthResponse);
}

message FetchRequest {
  string url = 1;
  FetchOptions options = 2;
}

message FetchOptions {
  int32 timeout_ms = 1;
  bool extract_fulltext = 2;
  bool process_images = 3;
  string image_proxy_base = 4;
  map<string, string> headers = 5;
}

message FetchResponse {
  string url = 1;
  string final_url = 2;
  string title = 3;
  string content = 4;           // HTML 格式
  string text_content = 5;      // 纯文本
  repeated Image images = 6;
  int32 reading_time = 7;
  string strategy = 8;          // "go" | "browserless"
  int64 duration_ms = 9;
  string error = 10;
}

message Image {
  string original_url = 1;
  string proxy_url = 2;
  string alt = 3;
  bool is_lazy = 4;
}
```

### 5.2 Node.js gRPC 客户端

```typescript
// src/lib/fetchers/clients/go-scraper-client.ts
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH = './api/proto/scraper.proto';

export class GoScraperClient {
  private client: any;

  constructor(address: string = 'localhost:50051') {
    const packageDef = protoLoader.loadSync(PROTO_PATH);
    const proto = grpc.loadPackageDefinition(packageDef) as any;
    this.client = new proto.scraper.ScraperService(
      address,
      grpc.credentials.createInsecure()
    );
  }

  async fetchArticle(url: string, options?: FetchOptions): Promise<FetchResponse> {
    return new Promise((resolve, reject) => {
      this.client.FetchArticle({ url, options }, (err: Error, response: any) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  }
}
```

## 六、数据库设计

```prisma
// prisma/schema.prisma

model Article {
  id            String   @id @default(cuid())
  sourceId      String
  source        Source   @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  externalId    String?
  title         String

  // === 内容字段 ===
  content       String?           // HTML 格式（用于展示）
  textContent   String?           // 纯文本（用于 AI/搜索）

  summary       String?
  url           String
  imageUrl      String?
  author        String?
  publishedAt   DateTime?
  fetchedAt     DateTime @default(now())
  read          Boolean  @default(false)
  starred       Boolean  @default(false)
  tags          String?
  category      String?
  readingTime   Int?

  // === 状态追踪 ===
  summaryStatus   String   @default("pending")  // pending/processing/completed/failed
  contentStatus   String   @default("pending")  // pending/fetching/completed/failed
  fetchStrategy   String?                        // go/browserless/fetch
  fetchDuration   Int?                           // 抓取耗时(ms)

  // === 关联 ===
  images        ArticleImage[]

  @@unique([sourceId, externalId])
  @@index([contentStatus])
  @@index([summaryStatus])
}

model ArticleImage {
  id           String   @id @default(cuid())
  articleId    String
  article      Article  @relation(fields: [articleId], references: [id], onDelete: Cascade)
  originalUrl  String
  proxyUrl     String?
  localPath    String?
  alt          String?
  status       String   @default("pending")
  createdAt    DateTime @default(now())

  @@unique([articleId, originalUrl])
}
```

## 七、实现阶段

### 阶段 0：快速修复（1-2 小时）⚡ 立即可做

**目标**：修复现有代码的核心问题

1. **修复 fulltext.ts**：使用 `article.content` 而非 `textContent`
2. **修复 rss.ts**：优先使用 `content` 而非 `contentSnippet`
3. **添加懒加载处理**：解析 `data-src` 等属性

### 阶段 1：本地增强（1-2 天）

**目标**：在现有 Node.js 架构内优化

1. 安装依赖：`isomorphic-dompurify`, `p-limit`
2. 实现 HTML 净化器
3. 实现图片处理器（懒加载属性）
4. 数据库迁移：添加 `textContent`, `contentStatus` 字段

### 阶段 2：Playwright 集成（2-3 天）

**目标**：支持动态页面抓取

1. 部署 Browserless Docker 容器
2. 实现 Browserless 客户端
3. 实现智能策略选择
4. 添加滚动加载支持

### 阶段 3：Go 抓取服务（3-5 天）

**目标**：高性能独立抓取服务

1. 创建 Go 项目结构
2. 实现 gRPC 服务
3. 集成 go-readability + bluemonday
4. 实现连接池和并发控制
5. Docker 化部署

### 阶段 4：imgproxy 集成（1 天）

**目标**：高性能图片代理

1. 部署 imgproxy Docker
2. 实现签名 URL 生成
3. 更新图片处理器使用 imgproxy

### 阶段 5：任务队列优化（2 天）

**目标**：可靠的异步处理

1. 安装 Redis + BullMQ
2. 重构任务调度逻辑
3. 实现优先级队列
4. 添加监控（Bull Board）

## 八、Docker Compose 完整配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  # 主应用
  newsflow:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=file:./data/newsflow.db
      - REDIS_URL=redis://redis:6379
      - GO_SCRAPER_URL=go-scraper:50051
      - BROWSERLESS_URL=ws://browserless:3000
      - IMGPROXY_URL=http://imgproxy:8080
    depends_on:
      - redis
      - go-scraper
      - browserless
      - imgproxy
    volumes:
      - ./data:/app/data

  # Redis 队列
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  # Go 抓取服务
  go-scraper:
    build: ./go-scraper-service
    environment:
      - GRPC_PORT=50051
      - HTTP_PORT=8080
      - MAX_CONCURRENT=100
      - BROWSERLESS_URL=ws://browserless:3000
    deploy:
      resources:
        limits:
          memory: 512M

  # Browserless 动态渲染
  browserless:
    image: browserless/chrome:latest
    environment:
      - MAX_CONCURRENT_SESSIONS=5
      - CONNECTION_TIMEOUT=60000
      - PREBOOT_CHROME=true
    deploy:
      resources:
        limits:
          memory: 2G

  # imgproxy 图片代理
  imgproxy:
    image: darthsim/imgproxy:latest
    environment:
      - IMGPROXY_BIND=:8080
      - IMGPROXY_LOCAL_FILESYSTEM_ROOT=/cache
      - IMGPROXY_KEY=${IMGPROXY_KEY}
      - IMGPROXY_SALT=${IMGPROXY_SALT}
    volumes:
      - imgproxy-cache:/cache
    deploy:
      resources:
        limits:
          memory: 256M

volumes:
  redis-data:
  imgproxy-cache:
```

## 九、性能优化清单

### Go 服务优化
- [x] HTTP 连接池复用（减少 TCP 握手）
- [x] DNS 缓存
- [x] 并发控制（goroutine 池）
- [x] 请求超时控制

### Browserless 优化
- [x] 浏览器预启动（PREBOOT_CHROME）
- [x] 页面复用（KEEP_ALIVE）
- [x] 资源阻止（字体、媒体）
- [x] 会话数限制

### imgproxy 优化
- [x] libvips 硬件加速
- [x] 响应缓存
- [x] WebP/AVIF 自动转换

### 整体架构优化
- [x] 服务解耦，独立扩展
- [x] gRPC 内部通信（比 REST 快 7-10 倍）
- [x] 异步任务队列
- [x] 智能回退策略

## 十、关键文件清单

| 优先级 | 文件/项目 | 操作 | 语言 |
|--------|----------|------|------|
| **P0** | `src/lib/fetchers/fulltext.ts` | 修复 | TS |
| **P0** | `src/lib/fetchers/rss.ts` | 修复 | TS |
| **P0** | `prisma/schema.prisma` | 修改 | Prisma |
| **P1** | `go-scraper-service/` | 新建项目 | Go |
| **P1** | `docker-compose.yml` | 新建 | YAML |
| **P1** | `src/lib/fetchers/clients/` | 新建 | TS |
| **P2** | imgproxy 配置 | 部署 | Docker |
| **P2** | Browserless 配置 | 部署 | Docker |

## 十一、验证方案

### 单元测试
```bash
# Go 服务测试
cd go-scraper-service && go test ./...

# Node.js 测试
npm test
```

### 集成测试
```bash
# 启动所有服务
docker-compose up -d

# 测试 Go 抓取服务
grpcurl -plaintext localhost:50051 scraper.ScraperService/HealthCheck

# 测试抓取
curl -X POST http://localhost:3000/api/sources/xxx/fetch
```

### 性能测试
```bash
# 静态页面吞吐量测试
wrk -t4 -c100 -d30s http://localhost:8080/fetch?url=...

# 目标：>1000 req/s
```

---

**总结**：此方案通过微服务解耦，将性能关键路径（抓取、图片处理）使用 Go 实现，同时保持 Node.js 处理业务逻辑和 UI，实现了性能与开发效率的最佳平衡。
