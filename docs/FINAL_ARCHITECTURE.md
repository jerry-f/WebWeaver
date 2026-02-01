# NewsFlow 分布式抓取系统 - 最终方案

## 三方案精华对比

| 维度 | 我的方案 | Claude Plan | Hyper-Spider |
|------|----------|-------------|--------------|
| **核心理念** | 微服务拆分 | 开源组件复用 | 控制平面/数据平面分离 |
| **图片服务** | 自研 Go/Rust | imgproxy ✅ | imgproxy + Varnish ✅ |
| **浏览器服务** | 自研 chromedp | Browserless ✅ | Browserless ✅ |
| **抓取服务** | 自研 Go | 自研 Go (Colly) | Go + TLS 指纹伪造 ✅ |
| **缓存层** | Redis | Redis | **Varnish (C级缓存)** ✅ |
| **队列** | Redis Streams | BullMQ | NATS/RabbitMQ |
| **AI 服务** | 独立 Python | 可选 | 异步 + 严格预算 ✅ |
| **性能优化** | 连接池、池化 | 资源拦截 | **域名级调度 + QualityScore** ✅ |

## 核心洞察提取

### 🎯 Hyper-Spider 的关键洞察

1. **控制平面 vs 数据平面分离**
   - 控制平面：决策、排队、规则、预算（轻量）
   - 数据平面：重活拆开，按瓶颈分别扩容

2. **TLS 指纹伪造 (JA3 Spoofing)** — 90% 网站不需要 Playwright
   ```
   痛点：很多网站被误判为需要浏览器渲染
   解法：Go cycletls 模拟 Chrome TLS 握手特征
   效果：减少 90% Playwright 调用，性能提升 50-100 倍
   ```

3. **域名级调度** — 被忽视的性能关键
   ```
   {host -> 并发上限}   // 同域名同时抓取别太多
   {host -> rps}        // 速率限制
   {host -> 指数退避}    // 失败后降低频率
   {host -> 熔断}       // 连续失败暂停
   ```

4. **QualityScore 驱动升级** — 只在必要时渲染
   ```
   静态 HTML 只有 #app 或正文极短 → 才进 renderer
   提取结果 link density 过高    → 才进规则+AI
   图片数异常                   → 才触发图片补全
   ```

5. **图片分层缓存** — Varnish (C级) + 对象存储 + CDN
   ```
   Varnish (内存) → 本地磁盘 → S3/MinIO → CDN
   内容寻址：按 SHA256 去重，同图全站复用
   ```

---

## 最终推荐架构：Scrape Fabric

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    控制平面 (Control Plane)                              │
│                                      NewsFlow Next.js                                    │
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│   │  • Job 调度 (BullMQ)           • 规则管理 (domain rules)                        │  │
│   │  • 优先级 (quick vs full)      • 成本预算 (Playwright/AI token)                 │  │
│   │  • 域名级限速/封禁/熔断         • 指标观测 (任务耗时、命中率)                     │  │
│   └─────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │ gRPC / HTTP
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    数据平面 (Data Plane)                                 │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              消息队列 (Redis Streams)                            │   │
│  │                                                                                  │   │
│  │   fetch_tasks ──┬──► quick_fetch (90%)                                          │   │
│  │                 └──► render_fetch (10%)                                         │   │
│  │   enhance_tasks ───► ai_tasks (按需)                                            │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                            │                                            │
│       ┌────────────────────────────────────┼────────────────────────────────────┐       │
│       │                                    │                                    │       │
│       ▼                                    ▼                                    ▼       │
│  ┌─────────────────┐              ┌─────────────────┐              ┌─────────────────┐ │
│  │  ⚡ fetchd (Go)  │              │ 🌐 renderd      │              │ 🖼️ mediad       │ │
│  │                 │              │   (Browserless) │              │  (imgproxy)     │ │
│  │ • TLS 指纹伪造   │   fallback   │                 │              │                 │ │
│  │   (cycletls)    │ ──────────► │ • 浏览器池       │              │ • 防盗链绕过     │ │
│  │ • 连接池复用    │              │ • 资源拦截       │              │ • WebP/AVIF     │ │
│  │ • 域名并发控制   │              │ • 滚动加载       │              │ • 签名 URL      │ │
│  │                 │              │                 │              │                 │ │
│  │ 扩容: 4-N 实例   │              │ 扩容: 2-4 实例   │              │ 扩容: 1-2 实例  │ │
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
│                   │ • URL 绝对化    │                                                   │
│                   │                 │                                                   │
│                   │ 扩容: 2-4 实例   │                                                   │
│                   │ 内存: 256MB/实例 │                                                   │
│                   └────────┬────────┘                                                   │
│                            │                                                            │
│                            ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              缓存层 (Varnish + Redis)                            │   │
│  │                                                                                  │   │
│  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │   │
│  │   │ Varnish (C)  │ →  │ Redis 热缓存  │ →  │  本地磁盘    │ →  │ S3/MinIO     │  │   │
│  │   │ 内存 LRU     │    │  TTL 1h      │    │  TTL 7d     │    │  永久存储    │  │   │
│  │   └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 组件选型最终决策

| 组件 | 选型 | 理由 |
|------|------|------|
| **fetchd** | Go + cycletls | TLS 指纹伪造，减少 90% 渲染需求 |
| **extractd** | Go (go-readability + bluemonday) | CPU 密集，Go 内存控制好 |
| **renderd** | Browserless (Docker) | 开箱即用，成熟稳定 |
| **mediad** | imgproxy | 1000 req / 200MB，极致性能 |
| **缓存** | Varnish + Redis | C 级吞吐 + 灵活 TTL |
| **队列** | Redis Streams | 轻量，Go/Node 都能用 |
| **AI** | Python FastAPI | 独立、异步、严格预算 |

---

## 核心性能优化策略

### 1. 任务分级：Quick Path vs Full Path

```
┌─────────────────────────────────────────────────────────────────┐
│                        Quick Path (热路径)                       │
│                                                                 │
│   RSS/列表 → fetchd (Go+TLS) → extractd → 入库                  │
│                                                                 │
│   目标：100ms ~ 1s                                              │
│   覆盖：90% 文章                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ QualityScore < 阈值
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Full Path (冷路径)                        │
│                                                                 │
│   → renderd (Browserless) → 滚动 → extractd → 图片本地化 → AI   │
│                                                                 │
│   目标：5s ~ 30s                                                │
│   覆盖：10% 文章                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. QualityScore 驱动升级

```go
type QualityScore struct {
    ContentLength   int     // 正文长度
    LinkDensity     float64 // 链接密度 (链接字符/总字符)
    ImageCount      int     // 图片数量
    HasMainContent  bool    // 是否有主内容
    IsSPAShell      bool    // 是否是 SPA 空壳
}

func (q *QualityScore) NeedsRenderer() bool {
    // 空壳
    if q.IsSPAShell { return true }
    // 内容太短
    if q.ContentLength < 500 { return true }
    // 链接密度过高 (可能是导航页)
    if q.LinkDensity > 0.5 { return true }
    // Readability 提取失败
    if !q.HasMainContent { return true }
    return false
}

func (q *QualityScore) NeedsAI() bool {
    // 内容有但质量差
    if q.ContentLength > 500 && q.LinkDensity > 0.3 { return true }
    return false
}
```

### 3. 域名级调度 (防封核心)

```go
type DomainScheduler struct {
    limits map[string]*DomainLimit
    mu     sync.RWMutex
}

type DomainLimit struct {
    MaxConcurrent int           // 同时最大并发
    RPS           float64       // 每秒请求数
    Backoff       time.Duration // 当前退避时间
    FailCount     int           // 连续失败次数
    CircuitOpen   bool          // 熔断状态
    LastRequest   time.Time
}

// 默认配置
var defaultLimits = map[string]*DomainLimit{
    "medium.com":     {MaxConcurrent: 2, RPS: 1},
    "twitter.com":    {MaxConcurrent: 1, RPS: 0.5},
    "zhihu.com":      {MaxConcurrent: 3, RPS: 2},
    "weixin.qq.com":  {MaxConcurrent: 5, RPS: 5},
    "*":              {MaxConcurrent: 10, RPS: 10}, // 默认
}

func (s *DomainScheduler) Acquire(host string) bool {
    limit := s.getLimit(host)
    
    // 熔断检查
    if limit.CircuitOpen {
        if time.Since(limit.LastRequest) < limit.Backoff {
            return false // 拒绝
        }
        limit.CircuitOpen = false // 尝试恢复
    }
    
    // 并发检查
    if limit.CurrentConcurrent >= limit.MaxConcurrent {
        return false
    }
    
    // RPS 检查
    if time.Since(limit.LastRequest) < time.Second/time.Duration(limit.RPS) {
        return false
    }
    
    limit.CurrentConcurrent++
    limit.LastRequest = time.Now()
    return true
}

func (s *DomainScheduler) ReportResult(host string, success bool) {
    limit := s.getLimit(host)
    limit.CurrentConcurrent--
    
    if success {
        limit.FailCount = 0
        limit.Backoff = 0
    } else {
        limit.FailCount++
        // 指数退避
        limit.Backoff = time.Duration(math.Pow(2, float64(limit.FailCount))) * time.Second
        // 熔断
        if limit.FailCount >= 5 {
            limit.CircuitOpen = true
            limit.Backoff = 5 * time.Minute
        }
    }
}
```

### 4. TLS 指纹伪造 (关键黑科技)

```go
// fetchd/tls_fetch.go
import (
    "github.com/Danny-Dasilva/CycleTLS/cycletls"
)

func FetchWithTLSSpoof(url string) (*Response, error) {
    client := cycletls.Init()
    
    // 模拟 Chrome 120 的 JA3 指纹
    response, err := client.Do(url, cycletls.Options{
        Body:      "",
        Ja3:       "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0",
        UserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Headers: map[string]string{
            "Accept":          "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
        },
    }, "GET")
    
    if err != nil {
        return nil, err
    }
    
    // 检查是否被反爬
    if response.Status == 403 || response.Status == 429 {
        return nil, ErrBlocked
    }
    
    return &Response{
        Body:       response.Body,
        StatusCode: response.Status,
        Headers:    response.Headers,
    }, nil
}
```

---

## Docker Compose 完整配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  # ==================== 控制平面 ====================
  
  newsflow:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://newsflow:secret@postgres:5432/newsflow
      - REDIS_URL=redis://redis:6379
      - FETCHD_URL=http://fetchd:8080
      - EXTRACTD_URL=http://extractd:8081
      - RENDERD_URL=ws://browserless:3000
      - IMGPROXY_URL=http://imgproxy:8080
      - IMGPROXY_KEY=${IMGPROXY_KEY}
      - IMGPROXY_SALT=${IMGPROXY_SALT}
    depends_on:
      - redis
      - postgres
      - fetchd
      - extractd
      - browserless
      - imgproxy

  # ==================== 数据平面 ====================
  
  # Go 极速抓取服务 (TLS 指纹伪造)
  fetchd:
    build: ./services/fetchd
    environment:
      - REDIS_URL=redis://redis:6379
      - MAX_CONCURRENT=100
      - EXTRACTD_URL=http://extractd:8081
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 256M
          cpus: '0.5'

  # Go 正文提取服务
  extractd:
    build: ./services/extractd
    environment:
      - IMGPROXY_BASE=http://imgproxy:8080
      - IMGPROXY_KEY=${IMGPROXY_KEY}
      - IMGPROXY_SALT=${IMGPROXY_SALT}
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 512M
          cpus: '1'

  # Browserless 浏览器渲染 (仅处理 10% 任务)
  browserless:
    image: browserless/chrome:latest
    environment:
      - MAX_CONCURRENT_SESSIONS=5
      - CONNECTION_TIMEOUT=60000
      - PREBOOT_CHROME=true
      - KEEP_ALIVE=true
      - ENABLE_DEBUGGER=false
      # 资源拦截
      - BLOCK_ADS=true
      - DEFAULT_BLOCK_ADS=true
    shm_size: '2gb'
    deploy:
      replicas: 1
      resources:
        limits:
          memory: 2G
          cpus: '2'

  # ==================== 媒体服务 ====================
  
  # Varnish 缓存 (C 级性能)
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

  # imgproxy 图片处理
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
      # 防盗链
      - IMGPROXY_SOURCE_URL_ENCRYPTION_KEY=${IMGPROXY_ENC_KEY}
    volumes:
      - imgproxy_cache:/cache
    deploy:
      replicas: 1
      resources:
        limits:
          memory: 256M
          cpus: '1'

  # ==================== 基础设施 ====================
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: >
      redis-server 
      --appendonly yes 
      --maxmemory 512mb 
      --maxmemory-policy allkeys-lru

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=newsflow
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=newsflow
    volumes:
      - pg_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          memory: 512M

volumes:
  redis_data:
  pg_data:
  imgproxy_cache:
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

---

## 实施路线图

### Phase 0: 立即修复 (1-2 小时) ⚡

```
修改 2 个文件，解决核心问题：
1. fulltext.ts: article.content 替代 textContent
2. rss.ts: content 优先于 contentSnippet
```

### Phase 1: 部署图片服务 (半天) 🖼️

```
1. 启动 imgproxy + varnish
2. 前端图片 URL 替换为代理 URL
3. 收益：图片不再丢失，加载速度提升 10x
```

### Phase 2: 部署浏览器服务 (半天) 🌐

```
1. 启动 Browserless
2. 修改 scrape.ts 连接远程浏览器
3. 收益：内存释放，稳定性提升
```

### Phase 3: 开发 Go fetchd (3-5 天) ⚡

```
1. 创建 Go 项目
2. 实现 TLS 指纹伪造
3. 实现域名级调度
4. 收益：90% 请求不需要 Playwright
```

### Phase 4: 开发 Go extractd (2-3 天) 📄

```
1. 集成 go-readability + bluemonday
2. 实现懒加载修复
3. 实现 QualityScore
4. 收益：解析性能提升 5x
```

### Phase 5: 任务队列优化 (1-2 天) 📋

```
1. Redis Streams 任务分发
2. Quick/Full 双队列
3. 收益：系统吞吐提升 10x
```

---

## 性能预期

| 指标 | 当前 | Phase 1-2 后 | 全部完成后 |
|------|------|--------------|------------|
| 静态抓取 QPS | ~50/s | ~100/s | **~1000/s** |
| 动态抓取 QPS | ~5/s | ~10/s | **~50/s** |
| 图片代理 QPS | N/A | ~500/s | **~5000/s** |
| 内存占用 | ~500MB | ~300MB | **~100MB** |
| Playwright 调用 | 100% | 50% | **10%** |

---

## 关键决策总结

1. **用 imgproxy 而非自研** — 省 3-5 天，性能更好
2. **用 Browserless 而非自研** — 省 5-7 天，更稳定
3. **Go + TLS 指纹伪造** — 减少 90% 渲染需求，关键黑科技
4. **Varnish 做图片缓存** — C 级性能，比 Redis 更适合大文件
5. **域名级调度** — 防封核心，减少无效重试
6. **QualityScore 驱动** — 只在必要时升级到 Playwright/AI

从 **Phase 0 立即修复** 开始？
