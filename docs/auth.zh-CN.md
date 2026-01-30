# JWT 登录与全局鉴权

从本版本开始，后端 API 默认启用 **JWT（Bearer）鉴权**：除登录接口与静态资源外，其余接口未携带有效 JWT 时会返回 `401 Unauthorized`。

## 环境变量

服务启动时会从环境变量读取以下配置（缺失会直接启动失败）：

```text
MOYU_ADMIN_USERNAME      管理员用户名（用于登录）
MOYU_ADMIN_PASSWORD      管理员密码（用于登录）
MOYU_JWT_SIGNING_KEY     JWT 签名密钥（HMAC-SHA256，对称密钥；至少 32 字符）
MOYU_JWT_EXPIRES_HOURS   JWT 有效期（小时，默认 24）
```

PowerShell 生成一个可用的随机签名密钥示例：

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

## 登录接口

`POST /api/auth/login`

请求体：

```json
{
  "username": "admin",
  "password": "******"
}
```

响应（示例字段）：

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
  "tokenType": "Bearer",
  "expiresAtUtc": "2026-01-30T00:00:00Z"
}
```

之后在请求头里带上：

```text
Authorization: Bearer <accessToken>
```

## WebSocket / SignalR / SSE 说明

浏览器原生 WebSocket / EventSource（SSE）无法自定义 `Authorization` Header，因此服务端允许在 WS 与 SSE 请求中使用 query string 传 token：

```text
?access_token=<JWT>
```

常见场景：

- `/api/chat`（SignalR Hub）
- `/api/terminal`（终端 WebSocket）
- 使用 SSE 的接口（例如 `/api/projects/scan-codex-sessions`）
