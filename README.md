# NewsFlow

基于 Next.js 的 RSS 阅读器/新闻聚合应用，支持分布式抓取、域名限速、Cookie 认证等高级功能。

## 快速开始

```bash
# 安装依赖
npm install

# 初始化数据库
npm run db:push
npm run db:seed

# 启动开发服务器（包含 Scheduler + Workers）
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          NewsFlow 分布式架构                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │   Web 服务      │     │  Cron 调度器    │     │    Workers      │       │
│  │                 │     │                 │     │                 │       │
│  │  - Next.js API  │     │  - 定时任务     │     │  - FetchWorker  │       │
│  │  - 页面渲染     │     │  - 触发抓取     │     │  - SummaryWorker│       │
│  │  - 用户认证     │     │  - 凭证刷新     │     │  - CredWorker   │       │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘       │
│           │                       │                       │                │
│           └───────────────────────┴───────────────────────┘                │
│                                   │                                        │
│                    ┌──────────────┴──────────────┐                         │
│                    │     Redis (BullMQ 队列)     │                         │
│                    │     SQLite/PostgreSQL       │                         │
│                    └─────────────────────────────┘                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 部署模式

### 单进程模式（开发/小型部署）

所有服务在同一个进程中运行：

```bash
npm run dev   # 开发模式
npm run start # 生产模式
```

### 分离部署模式（生产环境）

各服务独立运行，通过 Redis 通信：

```bash
# 终端 1: Web 服务（禁用内置 Scheduler 和 Workers）
DISABLE_SCHEDULER=true DISABLE_WORKERS=true npm run start

# 终端 2: Cron 调度器
npm run scheduler

# 终端 3: Workers（可启动多个实例）
WORKER_CONCURRENCY=10 npm run worker
```

## Docker 部署

### 构建镜像

```bash
# 构建 Web 服务
docker build --target web -t newsflow-web .

# 构建 Scheduler 服务
docker build --target scheduler -t newsflow-scheduler .

# 构建 Worker 服务
docker build --target worker -t newsflow-worker .
```

### Docker Compose

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  web:
    image: newsflow-web
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=file:/app/data/newsflow.db
      - REDIS_URL=redis://redis:6379
      - DISABLE_SCHEDULER=true
      - DISABLE_WORKERS=true
    volumes:
      - app_data:/app/data
    depends_on:
      - redis

  scheduler:
    image: newsflow-scheduler
    environment:
      - DATABASE_URL=file:/app/data/newsflow.db
      - REDIS_URL=redis://redis:6379
    volumes:
      - app_data:/app/data
    depends_on:
      - redis

  worker:
    image: newsflow-worker
    environment:
      - DATABASE_URL=file:/app/data/newsflow.db
      - REDIS_URL=redis://redis:6379
      - WORKER_CONCURRENCY=10
      - ENABLE_SCHEDULER=false
    volumes:
      - app_data:/app/data
    depends_on:
      - redis
    deploy:
      replicas: 3  # 启动 3 个 Worker 实例

volumes:
  redis_data:
  app_data:
```

启动服务：

```bash
docker compose up -d
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | - | 数据库连接地址 |
| `REDIS_URL` | - | Redis 连接地址 |
| `DISABLE_SCHEDULER` | `false` | 禁用内置 Cron 调度器 |
| `DISABLE_WORKERS` | `false` | 禁用内置 BullMQ Workers |
| `WORKER_CONCURRENCY` | `5` | Worker 并发数 |
| `ENABLE_SCHEDULER` | `true` | Worker 进程是否启用调度器 |
| `USE_QUEUE_FETCH` | `true` | 使用队列模式抓取全文 |
| `GO_SCRAPER_URL` | - | Go Scraper 服务地址 |

## NPM 命令

```bash
# 开发
npm run dev              # 启动开发服务器
npm run build            # 构建生产版本
npm run start            # 启动生产服务器

# 数据库
npm run db:push          # 推送 schema 到数据库
npm run db:seed          # 运行种子脚本
npm run db:studio        # 启动 Prisma Studio

# 分离部署
npm run scheduler        # 启动独立调度器
npm run scheduler:dev    # 启动调度器（开发模式，支持热重载）
npm run worker           # 启动独立 Workers
npm run worker:dev       # 启动 Workers（开发模式，支持热重载）

# 测试
npm run lint             # 运行 ESLint
npm run test:scraper     # 测试抓取器
```

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # 认证页面
│   ├── (dashboard)/       # 主应用页面
│   └── api/               # API 路由
├── components/            # React 组件
└── lib/                   # 核心库
    ├── auth/              # 认证模块（凭证管理、自动登录）
    ├── fetchers/          # 抓取器（RSS、Scrape、全文）
    ├── queue/             # BullMQ 队列和 Workers
    ├── scheduler/         # 域名调度器（限速、熔断）
    └── tasks/             # Cron 任务调度器

scripts/
├── start-scheduler.ts     # 独立调度器启动脚本
└── start-workers.ts       # 独立 Workers 启动脚本
```

## 核心功能

### 域名调度器

防止高频抓取被封禁：

- 每域名 RPS 限制
- 并发数控制
- 指数退避
- 熔断保护

### BullMQ 队列

异步任务处理：

- **FetchQueue**: 全文抓取任务
- **SummaryQueue**: AI 摘要生成
- **CredentialQueue**: 凭证刷新

### Cookie 认证

支持需要登录的站点：

- AES-256-GCM 加密存储
- 自动登录刷新
- 凭证过期检测

## License

MIT
