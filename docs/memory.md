# NewsFlow 开发备忘录

## WebSocket 认证机制

### 问题背景

NextAuth 的 session token cookie 默认设置为 **HttpOnly**，JavaScript 无法通过 `document.cookie` 直接读取。这导致 WebSocket 连接时无法获取认证 token。

### 解决方案

采用双重认证策略：

1. **优先读取 Cookie**（如果可访问）
   - 尝试多个可能的 cookie 名称：
     - `next-auth.session-token`（开发环境 HTTP）
     - `__Secure-next-auth.session-token`（生产环境 HTTPS）
     - `__Host-next-auth.session-token`

2. **Fallback: 使用 Session 构建 Base64 Token**
   - 如果 cookie 不可读，使用 `useSession()` 获取的用户信息
   - 构建 base64 编码的 JSON 作为 token：
   ```typescript
   token = btoa(JSON.stringify({
     id: session.user.id,
     email: session.user.email,
     role: session.user.role,
   }))
   ```

3. **服务端双重解析**
   - 先尝试 JWT 解码（正式方式）
   - 失败则尝试 base64 解码（备用方式）

### 相关文件

- 前端认证逻辑：`src/contexts/socket-context.tsx`
- 服务端认证中间件：`src/lib/websocket/middleware/auth.ts`

### 注意事项

- Base64 方式没有过期时间校验，仅适用于开发环境
- 生产环境建议确保 JWT token 正常工作

## 查看表字段

```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$queryRaw\`SELECT name, type FROM pragma_table_info('Article')\`.then(r => {
  console.log('Article 表字段:');
  r.forEach(col => console.log('  -', col.name));
}).finally(() => prisma.\$disconnect());
"
```

## db:generate
需要执行 db:generate, 因为 schema.prisma 有更新，比如新增了枚举类型 ArticleContentStatus
```bash
npx prisma generate
```