# Tailwind CSS v4 样式配置指南

## 问题背景

在 NewsFlow 项目中，我们使用 Tailwind CSS v4 和 Next.js 16。最初样式没有正确生效，页面呈现出未加样式的 HTML 外观（纯黑/白背景、蓝色链接、无卡片效果）。

## 根本原因

Tailwind CSS v4 与 v3 的配置方式完全不同：

| 特性 | Tailwind v3 | Tailwind v4 |
|------|------------|-------------|
| 配置文件 | `tailwind.config.ts` | CSS 文件内的 `@theme` 指令 |
| 颜色扩展 | `theme.extend.colors` | `@theme { --color-* }` |
| 导入方式 | `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| `@apply` | 支持自定义颜色类 | 不支持自定义颜色类 |

## 解决方案

### 1. globals.css 正确结构

```css
/* 必须放在最顶部 */
@import "tailwindcss";

/* Tailwind v4 主题定义 */
@theme {
  /* 字体 */
  --font-sans: 'Noto Sans SC', system-ui, sans-serif;
  --font-serif: 'Noto Serif SC', Georgia, serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* 颜色映射 - 引用 CSS 变量 */
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-primary: hsl(var(--primary));
  /* ... 其他颜色 */
}

/* CSS 变量定义 */
:root {
  --background: 40 30% 98%;
  --foreground: 20 15% 15%;
  --primary: 8 85% 45%;
  /* ... */
}

.dark {
  --background: 220 25% 10%;
  --foreground: 45 20% 92%;
  --primary: 38 100% 55%;
  /* ... */
}
```

### 2. 关键规则

1. **`@import "tailwindcss"` 必须在文件最顶部**
   - 不能有其他 `@import` 在它前面（Google Fonts 除外，但建议用 `<link>` 标签代替）

2. **使用 `@theme` 定义颜色映射**
   - 格式：`--color-{name}: hsl(var(--{name}));`
   - 这样 `bg-card`、`text-primary` 等类才能正确工作

3. **不要在 `@apply` 中使用自定义颜色类**
   - ❌ `@apply bg-background text-foreground border-border;`
   - ✅ 使用原生 CSS：`background-color: hsl(var(--background));`

4. **CSS 变量值使用空格分隔的 HSL 格式**
   - ❌ `--primary: hsl(8, 85%, 45%);`
   - ✅ `--primary: 8 85% 45%;`

### 3. tailwind.config.ts 的作用

在 Tailwind v4 中，`tailwind.config.ts` 仍然可以用于：
- `content` 配置（扫描路径）
- `darkMode: 'class'` 配置
- 插件配置

但颜色扩展应该在 CSS 的 `@theme` 中定义，而不是在 `theme.extend.colors` 中。

## 主题切换实现

使用 `next-themes` 库：

```tsx
// src/components/theme-provider.tsx
'use client'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children, ...props }) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}

// src/app/layout.tsx
<ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
  {children}
</ThemeProvider>
```

## 常见错误

### 错误 1: `Cannot apply unknown utility class`
```
Error: Cannot apply unknown utility class `bg-background/80`
```
**原因**: 在 `@apply` 中使用了自定义颜色类
**解决**: 改用原生 CSS

### 错误 2: `@import rules must precede all rules`
```
@import rules must precede all rules aside from @charset and @layer statements
```
**原因**: `@import` 不在文件顶部，或文件被重复写入
**解决**: 确保 `@import "tailwindcss"` 在第一行

## 验证方法

```bash
# 构建项目检查是否有错误
npm run build

# 如果样式不更新，清除缓存后重启
rm -rf .next && npm run dev
```
