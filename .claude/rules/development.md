# NewsFlow 开发规则

## 代码风格

### TypeScript
- 使用严格类型，避免 `any`
- 优先使用 `interface` 定义对象类型，`type` 用于联合类型和工具类型
- 异步函数统一使用 `async/await`

### 注释规范
- 所有代码注释使用中文
- 函数注释说明功能、参数和返回值
- 复杂逻辑添加行内注释解释意图
- TODO/FIXME 注释格式：`// TODO: 描述待办事项`

### 命名约定
- 组件文件：PascalCase (`ArticleList.tsx`)
- 工具函数文件：kebab-case (`reading-time.ts`)
- API 路由：小写 + 中括号动态段 (`[id]/route.ts`)

## 架构约定

### 路由组织
- `(auth)` - 认证相关页面，无需登录
- `(dashboard)` - 主应用页面，需要登录

### 数据获取
- 服务端组件直接使用 Prisma 查询
- 客户端组件通过 `/api/` 路由获取数据
- 新增抓取器类型需在 `src/lib/fetchers/index.ts` 的 switch 中注册

### API 路由
- 统一返回 JSON 格式
- 错误响应包含 `error` 字段
- 需要认证的接口检查 session

### 组件
- UI 基础组件放 `src/components/ui/`
- 业务组件放 `src/components/`
- 页面专属组件放在对应路由目录下

## Tailwind CSS v4 样式规范

> ⚠️ 本项目使用 Tailwind v4，与 v3 配置方式不同

- 使用 `@import "tailwindcss"` 而非 `@tailwind` 指令
- 颜色在 CSS `@theme` 中定义，不在 tailwind.config.ts
- 禁止 `@apply` 自定义颜色类，改用原生 CSS
- 详见：[docs/Tailwind-CSS-v4-样式配置指南.md](../../docs/Tailwind-CSS-v4-样式配置指南.md)

## 数据库

- Schema 修改后运行 `npm run db:push`
- 添加新模型需更新种子脚本 `prisma/seed.ts`
- 使用复合唯一索引避免重复数据 (`@@unique`)

## 安全

- 密码使用 bcrypt 加密
- API 路由验证用户权限
- 管理员功能检查 `role === 'admin'`
