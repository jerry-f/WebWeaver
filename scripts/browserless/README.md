# Browserless 测试指南

本目录包含 Browserless 服务的测试脚本，**默认启用 Stealth 模式**绕过反爬虫检测。

## 什么是 Browserless?

Browserless 是一个无头浏览器服务，提供以下核心能力：

1. **动态渲染** - 执行 JavaScript，渲染 SPA/CSR 页面
2. **截图生成** - 将网页转换为 PNG/JPEG 图片
3. **PDF 生成** - 将网页转换为 PDF 文档
4. **内容抓取** - 获取渲染后的 HTML 内容
5. **元素提取** - 通过 CSS 选择器提取特定内容

## ⚠️ 关于 Stealth 模式

### 为什么需要 Stealth 模式？

默认的 Headless Chrome 会暴露自动化特征：

```javascript
navigator.webdriver = true  // 🚨 被检测为自动化工具
UserAgent: "HeadlessChrome"  // 🚨 包含 Headless 标识
```

许多网站（如 Hacker News）会检测这些特征并拒绝访问。

### Stealth 模式的作用

本项目封装了 `BrowserlessClient`，自动隐藏这些特征：

- ✅ `navigator.webdriver = false`
- ✅ 正常的 Chrome UserAgent
- ✅ 模拟正常的插件和语言设置
- ✅ 添加 chrome 对象

## 本地服务配置

```yaml
# docker-compose.yml
browserless:
  image: browserless/chrome:latest
  ports:
    - "3300:3000"
```

**服务地址：** `http://localhost:3300`

## 使用方式

### 方式 1：使用封装的客户端（推荐）

```typescript
import { BrowserlessClient } from './utils/browserless-client'

const client = new BrowserlessClient()

// 获取页面内容（自动 Stealth）
const html = await client.getContent('https://news.ycombinator.com')

// 截图（自动 Stealth）
const buffer = await client.screenshot('https://news.ycombinator.com')

// 抓取内容（自动 Stealth）
const data = await client.scrape('https://example.com', {
  selectors: ['h1', 'p', 'a']
})
```

### 方式 2：使用便捷函数

```typescript
import { getContent, screenshot, scrape } from './utils/browserless-client'

const html = await getContent('https://example.com')
const buffer = await screenshot('https://example.com')
const data = await scrape('https://example.com', ['h1', 'p'])
```

## API 参考

### BrowserlessClient

```typescript
const client = new BrowserlessClient(baseUrl?: string)

// 健康检查
await client.checkHealth()

// 获取内容
await client.getContent(url, {
  waitUntil: 'networkidle2',  // 等待策略
  timeout: 30000,              // 超时时间
  stealth: true                // Stealth 模式（默认开启）
})

// 截图
await client.screenshot(url, {
  fullPage: false,   // 全页截图
  type: 'png',       // 'png' | 'jpeg'
  quality: 80        // JPEG 质量
})

// 抓取
await client.scrape(url, {
  selectors: ['h1', '.content', 'a']
})

// PDF
await client.pdf(url, {
  format: 'A4',
  landscape: false
})

// 自定义脚本
await client.execute(url, `
  // 这里写 Puppeteer 代码
  const title = await page.title();
  return { data: { title }, type: 'application/json' };
`)
```

## 测试脚本列表

| 脚本 | 说明 | 命令 |
|------|------|------|
| `01-health-check.ts` | 服务健康检查 | `npx tsx scripts/browserless/01-health-check.ts` |
| `02-content-api.ts` | 获取页面内容 | `npx tsx scripts/browserless/02-content-api.ts` |
| `03-screenshot-api.ts` | 页面截图 | `npx tsx scripts/browserless/03-screenshot-api.ts` |
| `05-scrape-api.ts` | CSS 选择器抓取 | `npx tsx scripts/browserless/05-scrape-api.ts` |

## 配置参数说明

### waitUntil（等待策略）

| 选项 | 速度 | 说明 |
|------|------|------|
| `domcontentloaded` | ⚡ 最快 | DOM 解析完成 |
| `load` | 🔄 中等 | 页面 load 事件触发 |
| `networkidle2` | 🐢 最慢 | 500ms 内 ≤2 个网络请求（最完整） |

### 视口设置

```typescript
{
  viewportWidth: 1280,
  viewportHeight: 800
}
```

常用尺寸：
- 移动端: 375 x 667
- 平板: 768 x 1024
- 桌面: 1920 x 1080

## 目录结构

```
scripts/browserless/
├── README.md                      # 本文档
├── utils/
│   └── browserless-client.ts      # 🔑 核心客户端封装
├── output/                        # 截图输出目录
├── 01-health-check.ts             # 健康检查
├── 02-content-api.ts              # 内容获取
├── 03-screenshot-api.ts           # 截图功能
└── 05-scrape-api.ts               # 内容抓取
```

## 注意事项

1. **默认启用 Stealth** - 所有请求默认使用 Stealth 模式
2. **超时设置** - 复杂页面建议设置 30-60 秒
3. **并发限制** - 服务配置 `MAX_CONCURRENT_SESSIONS=5`
4. **内存限制** - 容器限制 2G 内存，大页面可能消耗较多资源

## 故障排除

### 连接失败

```bash
# 检查容器状态
docker ps | grep browserless

# 重启服务
docker-compose restart browserless

# 查看日志
docker logs newsflow-browserless --tail 50
```

### 请求超时

1. 增加 `timeout` 参数
2. 使用 `domcontentloaded` 代替 `networkidle2`
3. 检查目标网站是否可访问

### 内容为空

1. 确认 Stealth 模式已启用（默认开启）
2. 尝试增加等待时间
3. 检查 CSS 选择器是否正确
