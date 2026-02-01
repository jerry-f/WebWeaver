# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

NewsFlow 是一个基于 Next.js 16 的 RSS 阅读器/新闻聚合应用，使用 App Router、Prisma (SQLite)、NextAuth.js 认证和 Tailwind CSS 4。

## 常用命令

```bash
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run lint         # 运行 ESLint
npm run db:push      # 将 Prisma schema 推送到数据库
npm run db:seed      # 运行数据库种子脚本
npm run db:studio    # 启动 Prisma Studio 查看数据
```

## 架构概览

### 路由组结构
- `src/app/(auth)/` - 认证相关页面 (login, register)
- `src/app/(dashboard)/` - 主应用页面 (dashboard, sources, articles, settings, admin)
- `src/app/api/` - API 路由

### 核心模块

**数据获取系统** (`src/lib/fetchers/`):
- `index.ts` - 统一入口，`fetchSource()` 和 `fetchAllSources()` 函数
- `rss.ts` - RSS 源解析
- `fulltext.ts` - 全文抓取 (使用 @mozilla/readability)
- 通过 source.type 字段区分不同类型的源

**数据模型** (`prisma/schema.prisma`):
- `Source` - 新闻源配置 (RSS/API/Scrape)
- `Article` - 文章内容，关联到 Source

**认证** (`src/lib/auth.ts`):
- NextAuth.js v4 配置
- 使用 Credentials Provider + bcrypt
- JWT session 策略
- 用户包含 role 字段用于权限控制
