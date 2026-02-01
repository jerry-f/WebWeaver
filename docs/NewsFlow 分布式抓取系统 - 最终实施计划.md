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
    github.com/gocolly/colly/v2             // 爬虫框架
    github.com/go-shiori/go-readability     // 正文提取
    github.com/microcosm-cc/bluemonday      // HTML 净化
    github.com/PuerkitoBio/goquery          // HTML 解析
    google.golang.org/grpc                  // gRPC 通信
    github.com/Danny-Dasilva/CycleTLS/cycletls  // TLS 指纹伪造（关键）
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
      - IMGPROXY_URL=http://varnish:80
      - CREDENTIAL_SECRET=${CREDENTIAL_SECRET}
    depends_on:
      - redis
      - go-scraper
      - browserless
      - varnish
    volumes:
      - ./data:/app/data

  # Redis 队列
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru

  # Go 抓取服务
  go-scraper:
    build: ./go-scraper-service
    environment:
      - GRPC_PORT=50051
      - HTTP_PORT=8080
      - MAX_CONCURRENT=100
      - BROWSERLESS_URL=ws://browserless:3000
      - REDIS_URL=redis://redis:6379
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
      - KEEP_ALIVE=true
      - ENABLE_DEBUGGER=false
      - BLOCK_ADS=true
    shm_size: '2gb'
    deploy:
      resources:
        limits:
          memory: 2G

  # Varnish 缓存（C 级性能，放在 imgproxy 前面）
  varnish:
    image: varnish:stable
    ports:
      - "8888:80"
    volumes:
      - ./config/varnish.vcl:/etc/varnish/default.vcl:ro
    environment:
      - VARNISH_SIZE=256M
    depends_on:
      - imgproxy
    deploy:
      resources:
        limits:
          memory: 512M

  # imgproxy 图片代理
  imgproxy:
    image: darthsim/imgproxy:latest
    environment:
      - IMGPROXY_BIND=:8080
      - IMGPROXY_LOCAL_FILESYSTEM_ROOT=/cache
      - IMGPROXY_USE_ETAG=true
      - IMGPROXY_CACHE_CONTROL_PASSTHROUGH=true
      - IMGPROXY_ENABLE_WEBP_DETECTION=true
      - IMGPROXY_ENABLE_AVIF_DETECTION=true
      - IMGPROXY_MAX_SRC_RESOLUTION=50
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

### Varnish 配置

```vcl
# config/varnish.vcl
vcl 4.1;

backend imgproxy {
    .host = "imgproxy";
    .port = "8080";
}

sub vcl_recv {
    # 只缓存图片请求
    if (req.url ~ "^/insecure/" || req.url ~ "^/signature/") {
        return (hash);
    }
    return (pass);
}

sub vcl_backend_response {
    # 图片缓存 7 天
    if (beresp.http.content-type ~ "image/") {
        set beresp.ttl = 7d;
        set beresp.grace = 1d;
        unset beresp.http.set-cookie;
    }
}

sub vcl_deliver {
    # 添加缓存命中标识
    if (obj.hits > 0) {
        set resp.http.X-Cache = "HIT";
    } else {
        set resp.http.X-Cache = "MISS";
    }
}
```

## 九、性能优化清单

### Go 服务优化
- [ ] HTTP 连接池复用（减少 TCP 握手）
- [ ] DNS 缓存
- [ ] 并发控制（goroutine 池）
- [ ] 请求超时控制
- [ ] TLS 指纹伪造（cycletls）

### 域名级调度（防封核心）
- [ ] 每域名并发上限控制
- [ ] 每域名 RPS 限速
- [ ] 失败指数退避（2^n 秒）
- [ ] 连续 5 次失败熔断（暂停 5 分钟）
- [ ] 熔断自动恢复探测
- [ ] 域名级统计监控

### Browserless 优化
- [ ] 浏览器预启动（PREBOOT_CHROME）
- [ ] 页面复用（KEEP_ALIVE）
- [ ] 资源阻止（字体、媒体、广告）
- [ ] 会话数限制

### imgproxy 优化
- [ ] libvips 硬件加速
- [ ] 响应缓存
- [ ] WebP/AVIF 自动转换

### Varnish 缓存优化
- [ ] 图片缓存 7 天 TTL
- [ ] 缓存命中率监控
- [ ] 内存缓存 256MB

### 整体架构优化
- [ ] 服务解耦，独立扩展
- [ ] gRPC 内部通信（比 REST 快 7-10 倍）
- [ ] 异步任务队列
- [ ] 智能回退策略
- [ ] QualityScore 驱动升级

## 十、关键文件清单

| 优先级 | 文件/项目 | 操作 | 语言 |
|--------|----------|------|------|
| **P0** | `src/lib/fetchers/fulltext.ts` | 修复 | TS |
| **P0** | `src/lib/fetchers/rss.ts` | 修复 | TS |
| **P0** | `prisma/schema.prisma` | 修改 | Prisma |
| **P1** | `src/lib/auth/credential-crypto.ts` | 新建 | TS |
| **P1** | `src/lib/auth/auto-login.ts` | 新建 | TS |
| **P1** | `src/lib/fetchers/auth-fetch.ts` | 新建 | TS |
| **P1** | `go-scraper-service/` | 新建项目 | Go |
| **P1** | `docker-compose.yml` | 新建 | YAML |
| **P1** | `config/varnish.vcl` | 新建 | VCL |
| **P1** | `src/lib/fetchers/clients/` | 新建 | TS |
| **P2** | imgproxy 配置 | 部署 | Docker |
| **P2** | Browserless 配置 | 部署 | Docker |
| **P3** | `src/lib/tasks/refresh-credentials.ts` | 新建 | TS |

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

## 十二、用户认证内容抓取

### 场景说明

用户抓取自己已登录账号的付费/私有内容（完全合规场景）。

### 方案：Cookie 注入 + 自动维护

**核心思路**：系统统一管理用户的登录凭证，定期自动刷新保证有效性。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Cookie 认证流程                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. 用户配置阶段                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  用户在 UI 中添加需要登录的源：                                       │   │
│  │                                                                      │   │
│  │  方式 A：手动粘贴 Cookie                                              │   │
│  │  - 用户从浏览器开发者工具复制 Cookie                                   │   │
│  │  - 系统 AES-256 加密存储到数据库                                      │   │
│  │                                                                      │   │
│  │  方式 B：自动登录（推荐）                                             │   │
│  │  - 用户提供账号密码（加密存储）                                       │   │
│  │  - 系统通过 Browserless 自动登录获取 Cookie                          │   │
│  │  - 定时任务自动刷新 Cookie                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  2. 抓取阶段                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  抓取任务 → 检查源是否需要认证 → 解密 Cookie → 注入到请求头           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  3. 维护阶段                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  定时任务（可配置：每天/每周）：                                       │   │
│  │  - 检测 Cookie 是否过期（抓取失败 401/403）                           │   │
│  │  - 自动重新登录刷新 Cookie                                           │   │
│  │  - 更新数据库中的加密凭证                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 数据库设计

```prisma
// 站点认证凭证表
model SiteCredential {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  // 站点标识
  domain          String                    // 域名，如 "medium.com"
  name            String?                   // 显示名称，如 "Medium 会员"

  // 认证方式
  authType        String                    // 'cookie' | 'login' | 'token'

  // 加密存储的凭证（AES-256-GCM）
  encryptedCookie     String?              // 加密后的 Cookie
  encryptedUsername   String?              // 加密后的用户名
  encryptedPassword   String?              // 加密后的密码
  encryptedToken      String?              // 加密后的 API Token

  // 登录配置（用于自动登录）
  loginUrl            String?              // 登录页面 URL
  loginSelectors      String?              // JSON: { username: '#email', password: '#pwd', submit: 'button' }

  // 状态追踪
  status          String    @default("active")    // active/expired/error
  lastUsedAt      DateTime?
  lastRefreshedAt DateTime?
  expiresAt       DateTime?                       // Cookie 预计过期时间
  errorMessage    String?

  // 刷新配置
  refreshInterval String    @default("weekly")    // daily/weekly/manual

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // 关联到使用此凭证的源
  sources         Source[]

  @@unique([userId, domain])
  @@index([status])
  @@index([expiresAt])
}

// Source 表添加关联
model Source {
  // ... 现有字段

  // 认证关联（可选）
  credentialId    String?
  credential      SiteCredential? @relation(fields: [credentialId], references: [id])
}
```

### 核心实现

#### 1. 凭证加密服务

```typescript
// src/lib/auth/credential-crypto.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = scryptSync(process.env.CREDENTIAL_SECRET!, 'salt', 32);

export function encryptCredential(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // 格式：iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptCredential(encrypted: string): string {
  const [ivHex, authTagHex, encryptedData] = encrypted.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

#### 2. 自动登录服务

```typescript
// src/lib/auth/auto-login.ts
import { chromium } from 'playwright';

interface LoginConfig {
  loginUrl: string;
  selectors: {
    username: string;
    password: string;
    submit: string;
    successIndicator?: string;  // 登录成功后出现的元素
  };
}

export async function autoLogin(
  config: LoginConfig,
  username: string,
  password: string
): Promise<string> {
  const browser = await chromium.connect(process.env.BROWSERLESS_URL!);
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 访问登录页
    await page.goto(config.loginUrl, { waitUntil: 'networkidle' });

    // 2. 填写表单
    await page.fill(config.selectors.username, username);
    await page.fill(config.selectors.password, password);

    // 3. 点击登录
    await page.click(config.selectors.submit);

    // 4. 等待登录成功
    if (config.selectors.successIndicator) {
      await page.waitForSelector(config.selectors.successIndicator, { timeout: 10000 });
    } else {
      await page.waitForNavigation({ waitUntil: 'networkidle' });
    }

    // 5. 提取 Cookie
    const cookies = await context.cookies();
    const cookieString = cookies
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    return cookieString;
  } finally {
    await context.close();
  }
}
```

#### 3. Cookie 刷新定时任务

```typescript
// src/lib/tasks/refresh-credentials.ts
import { prisma } from '../prisma';
import { decryptCredential, encryptCredential } from '../auth/credential-crypto';
import { autoLogin } from '../auth/auto-login';

export async function refreshExpiredCredentials() {
  // 查找需要刷新的凭证
  const credentials = await prisma.siteCredential.findMany({
    where: {
      OR: [
        { status: 'expired' },
        {
          refreshInterval: 'daily',
          lastRefreshedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        },
        {
          refreshInterval: 'weekly',
          lastRefreshedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      ],
      authType: 'login',  // 只有 login 类型才能自动刷新
    }
  });

  for (const cred of credentials) {
    try {
      // 解密用户名密码
      const username = decryptCredential(cred.encryptedUsername!);
      const password = decryptCredential(cred.encryptedPassword!);
      const loginConfig = JSON.parse(cred.loginSelectors!);

      // 自动登录获取新 Cookie
      const newCookie = await autoLogin(
        { loginUrl: cred.loginUrl!, selectors: loginConfig },
        username,
        password
      );

      // 更新数据库
      await prisma.siteCredential.update({
        where: { id: cred.id },
        data: {
          encryptedCookie: encryptCredential(newCookie),
          status: 'active',
          lastRefreshedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 假设 7 天有效
          errorMessage: null,
        }
      });

      console.log(`✅ Refreshed credential for ${cred.domain}`);
    } catch (error) {
      // 刷新失败，标记状态
      await prisma.siteCredential.update({
        where: { id: cred.id },
        data: {
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        }
      });

      console.error(`❌ Failed to refresh credential for ${cred.domain}:`, error);
    }
  }
}
```

#### 4. 抓取时注入 Cookie

```typescript
// src/lib/fetchers/auth-fetch.ts
import { prisma } from '../prisma';
import { decryptCredential } from '../auth/credential-crypto';

export async function fetchWithAuth(sourceId: string, url: string): Promise<Response> {
  // 获取源配置
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { credential: true }
  });

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; NewsFlow/1.0)',
  };

  // 如果有认证凭证，注入 Cookie
  if (source?.credential?.encryptedCookie) {
    try {
      const cookie = decryptCredential(source.credential.encryptedCookie);
      headers['Cookie'] = cookie;
    } catch (error) {
      console.error('Failed to decrypt cookie:', error);
    }
  }

  const response = await fetch(url, { headers });

  // 检测认证失败，标记凭证过期
  if (response.status === 401 || response.status === 403) {
    if (source?.credential) {
      await prisma.siteCredential.update({
        where: { id: source.credential.id },
        data: { status: 'expired' }
      });
    }
  }

  return response;
}
```

### 常见站点登录配置示例

```typescript
// src/lib/auth/site-configs.ts

export const SITE_LOGIN_CONFIGS: Record<string, {
  loginUrl: string;
  selectors: {
    username: string;
    password: string;
    submit: string;
    successIndicator?: string;
  };
}> = {
  'medium.com': {
    loginUrl: 'https://medium.com/m/signin',
    selectors: {
      username: 'input[name="email"]',
      password: 'input[name="password"]',
      submit: 'button[type="submit"]',
      successIndicator: '[data-testid="headerAvatar"]',
    }
  },
  'zhihu.com': {
    loginUrl: 'https://www.zhihu.com/signin',
    selectors: {
      username: 'input[name="username"]',
      password: 'input[name="password"]',
      submit: 'button[type="submit"]',
      successIndicator: '.AppHeader-profile',
    }
  },
  // 更多站点配置...
};
```

### 安全注意事项

| 措施 | 说明 |
|------|------|
| **AES-256-GCM 加密** | 所有凭证加密存储，密钥从环境变量读取 |
| **密钥轮换** | 支持定期轮换 CREDENTIAL_SECRET |
| **最小权限** | 凭证仅用于对应域名的抓取 |
| **用户隔离** | 每个用户的凭证完全隔离 |
| **审计日志** | 记录凭证的使用和刷新历史 |
| **用户通知** | 凭证过期或刷新失败时通知用户 |

### 实施阶段

**阶段 1.5：Cookie 认证支持（1-2 天）**

1. 数据库迁移：添加 `SiteCredential` 表
2. 实现凭证加密/解密服务
3. 实现手动粘贴 Cookie 功能
4. 修改抓取逻辑，注入 Cookie

**阶段 6（可选）：自动登录维护**

1. 实现自动登录服务
2. 添加定时刷新任务
3. 配置常见站点的登录规则
4. 实现凭证状态监控和通知

## 十三、域名级调度（防封核心）

### 调度策略

```typescript
// src/lib/scheduler/domain-scheduler.ts

interface DomainLimit {
  maxConcurrent: number;    // 同时最大并发
  rps: number;              // 每秒请求数
  backoff: number;          // 当前退避时间 (ms)
  failCount: number;        // 连续失败次数
  circuitOpen: boolean;     // 熔断状态
  lastRequest: number;      // 上次请求时间戳
}

// 默认限制配置
const DEFAULT_LIMITS: Record<string, Partial<DomainLimit>> = {
  'medium.com':     { maxConcurrent: 2, rps: 1 },
  'twitter.com':    { maxConcurrent: 1, rps: 0.5 },
  'zhihu.com':      { maxConcurrent: 3, rps: 2 },
  'weixin.qq.com':  { maxConcurrent: 5, rps: 5 },
  '*':              { maxConcurrent: 10, rps: 10 },  // 默认
};
```

### 性能优化清单补充

```markdown
### 域名级调度（防封核心）
- [ ] 每域名并发上限控制
- [ ] 每域名 RPS 限速
- [ ] 失败指数退避（2^n 秒）
- [ ] 连续 5 次失败熔断（暂停 5 分钟）
- [ ] 熔断自动恢复探测
- [ ] 域名级统计监控
```

## 十四、修订后的实施路线图

| 阶段 | 内容 | 时间 | 优先级 |
|------|------|------|--------|
| **Phase 0** | 修复 fulltext.ts/rss.ts | 1-2h | P0 |
| **Phase 1** | 本地增强 (HTML净化、懒加载) | 1-2天 | P0 |
| **Phase 1.5** | Cookie 认证支持 | 1-2天 | P1 |
| **Phase 2** | Browserless 部署 | 2-3天 | P1 |
| **Phase 3** | Go fetchd (TLS伪造、域名调度) | 3-5天 | P1 |
| **Phase 4** | imgproxy + Varnish | 1天 | P2 |
| **Phase 5** | BullMQ 任务队列 | 2天 | P2 |
| **Phase 6** | 自动登录维护（可选） | 2-3天 | P3 |
