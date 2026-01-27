# 会话管理重构设计文档

## 架构概览

### 核心组件

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (React)                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ProjectChat 组件                                      │  │
│  │ - 显示当前活跃会话                                    │  │
│  │ - 会话列表面板                                        │  │
│  │ - 运行中会话指示器                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ SignalR 客户端                                        │  │
│  │ - 连接到 ChatHub                                      │  │
│  │ - 接收实时消息                                        │  │
│  │ - 自动重连                                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕ SignalR
┌─────────────────────────────────────────────────────────────┐
│                    后端 (ASP.NET Core)                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ChatHub (SignalR)                                    │  │
│  │ - JoinSession(sessionId)                             │  │
│  │ - LeaveSession(sessionId)                            │  │
│  │ - BroadcastMessage(sessionId, message)               │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ SessionManager                                        │  │
│  │ - 创建/删除会话                                       │  │
│  │ - 管理会话生命周期                                    │  │
│  │ - 查询运行中会话                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ A2aTaskManager (改进)                                │  │
│  │ - 后台执行任务                                        │  │
│  │ - 通过 SignalR 推送消息                               │  │
│  │ - 消息持久化到数据库                                  │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 数据库 (SQLite)                                       │  │
│  │ - SessionEntity                                       │  │
│  │ - SessionMessageEntity                               │  │
│  │ - ProjectEntity (增加 CurrentSessionId)              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 数据模型

### SessionEntity

```csharp
public sealed class SessionEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid ProjectId { get; set; }

    public ProjectEntity? Project { get; set; }

    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = "";

    public string State { get; set; } = "IDLE"; // IDLE, RUNNING, COMPLETED, FAILED, CANCELLED

    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? CompletedAtUtc { get; set; }

    public List<SessionMessageEntity> Messages { get; set; } = new();
}
```

### SessionMessageEntity

```csharp
public sealed class SessionMessageEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid SessionId { get; set; }

    public SessionEntity? Session { get; set; }

    [Required]
    [MaxLength(20)]
    public string Role { get; set; } = ""; // "user", "agent", "system"

    [Required]
    public string Content { get; set; } = "";

    public string? MessageType { get; set; } = "text"; // "text", "tool", "status", "artifact"

    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}
```

### ProjectEntity 扩展

```csharp
public sealed class ProjectEntity
{
    // ... 现有字段 ...

    public Guid? CurrentSessionId { get; set; }

    public SessionEntity? CurrentSession { get; set; }

    public List<SessionEntity> Sessions { get; set; } = new();
}
```

---

## API 端点设计

### 会话管理 API

#### 创建会话
```
POST /api/sessions
{
  "projectId": "guid",
  "title": "string (optional)"
}
Response:
{
  "id": "guid",
  "projectId": "guid",
  "title": "string",
  "state": "IDLE",
  "createdAtUtc": "ISO8601"
}
```

#### 获取项目的所有会话
```
GET /api/projects/{projectId}/sessions
Response:
{
  "sessions": [
    {
      "id": "guid",
      "title": "string",
      "state": "RUNNING|COMPLETED|FAILED|IDLE",
      "createdAtUtc": "ISO8601",
      "updatedAtUtc": "ISO8601",
      "messageCount": 42
    }
  ]
}
```

#### 获取运行中的所有会话
```
GET /api/sessions/running
Response:
{
  "sessions": [
    {
      "id": "guid",
      "projectId": "guid",
      "projectName": "string",
      "title": "string",
      "state": "RUNNING",
      "createdAtUtc": "ISO8601",
      "messageCount": 42
    }
  ]
}
```

#### 切换项目的当前会话
```
PUT /api/projects/{projectId}/current-session
{
  "sessionId": "guid"
}
Response:
{
  "success": true,
  "currentSessionId": "guid"
}
```

#### 获取会话的历史消息
```
GET /api/sessions/{sessionId}/messages?skip=0&take=50
Response:
{
  "messages": [
    {
      "id": "guid",
      "role": "user|agent|system",
      "content": "string",
      "messageType": "text|tool|status|artifact",
      "createdAtUtc": "ISO8601"
    }
  ],
  "total": 100
}
```

#### 删除会话
```
DELETE /api/sessions/{sessionId}
Response:
{
  "success": true
}
```

---

## SignalR Hub 设计

### ChatHub

```csharp
public class ChatHub : Hub
{
    // 客户端加入会话组
    public async Task JoinSession(string sessionId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"session-{sessionId}");
        await Clients.Group($"session-{sessionId}")
            .SendAsync("UserJoined", Context.ConnectionId);
    }

    // 客户端离开会话组
    public async Task LeaveSession(string sessionId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"session-{sessionId}");
        await Clients.Group($"session-{sessionId}")
            .SendAsync("UserLeft", Context.ConnectionId);
    }
}
```

### 服务端推送消息

```csharp
// 在 A2aTaskManager 中
private readonly IHubContext<ChatHub> _hubContext;

private async Task BroadcastMessageAsync(string sessionId, object message)
{
    await _hubContext.Clients
        .Group($"session-{sessionId}")
        .SendAsync("ReceiveMessage", message);
}
```

### 客户端接收消息

```typescript
// 前端 React Hook
const connection = new HubConnectionBuilder()
    .withUrl("/api/chat")
    .withAutomaticReconnect()
    .build();

connection.on("ReceiveMessage", (message) => {
    // 处理消息
    updateChatState(message);
});

await connection.start();
await connection.invoke("JoinSession", sessionId);
```

---

## 消息流程

### 创建新会话并启动任务

```
1. 前端调用 POST /api/sessions
   ↓
2. 后端创建 SessionEntity，返回 sessionId
   ↓
3. 前端通过 SignalR 加入会话组 (JoinSession)
   ↓
4. 前端调用 POST /api/a2a (启动 A2A 任务)
   ↓
5. 后端 A2aTaskManager 启动任务
   ↓
6. 任务执行过程中：
   - 保存消息到 SessionMessageEntity
   - 通过 SignalR 推送到 session-{sessionId} 组
   ↓
7. 前端实时接收消息并更新 UI
```

### 切换会话

```
1. 前端显示会话列表
   ↓
2. 用户点击切换会话
   ↓
3. 前端调用 PUT /api/projects/{projectId}/current-session
   ↓
4. 后端更新 ProjectEntity.CurrentSessionId
   ↓
5. 前端离开旧会话组 (LeaveSession)
   ↓
6. 前端加入新会话组 (JoinSession)
   ↓
7. 前端调用 GET /api/sessions/{sessionId}/messages 加载历史消息
   ↓
8. 前端显示历史消息和实时消息
```

---

## 实现细节

### 后台任务执行

A2aTaskManager 改进：
- 任务启动时创建 SessionEntity
- 每条消息保存到 SessionMessageEntity
- 通过 SignalR 推送消息到对应会话组
- 任务完成时更新 SessionEntity.State

### 消息持久化

```csharp
private async Task SaveMessageAsync(
    Guid sessionId,
    string role,
    string content,
    string messageType = "text")
{
    var message = new SessionMessageEntity
    {
        SessionId = sessionId,
        Role = role,
        Content = content,
        MessageType = messageType,
        CreatedAtUtc = DateTimeOffset.UtcNow
    };

    await _dbContext.SessionMessages.AddAsync(message);
    await _dbContext.SaveChangesAsync();
}
```

### 运行中会话查询

```csharp
public async Task<List<SessionDto>> GetRunningSessionsAsync()
{
    return await _dbContext.Sessions
        .Where(s => s.State == "RUNNING")
        .Include(s => s.Project)
        .Select(s => new SessionDto
        {
            Id = s.Id,
            ProjectId = s.ProjectId,
            ProjectName = s.Project!.Name,
            Title = s.Title,
            State = s.State,
            CreatedAtUtc = s.CreatedAtUtc,
            MessageCount = s.Messages.Count
        })
        .ToListAsync();
}
```

---

## 前端 UI 设计

### 会话面板布局

```
┌─────────────────────────────────────┐
│ 运行中会话 (3)                       │
├─────────────────────────────────────┤
│ ○ Session 1 (Project A)             │
│ ○ Session 2 (Project B)             │
│ ○ Session 3 (Project A)             │
├─────────────────────────────────────┤
│ 历史会话                             │
├─────────────────────────────────────┤
│ ✓ Session 4 (Project A)             │
│ ✓ Session 5 (Project B)             │
│ ✗ Session 6 (Project A)             │
├─────────────────────────────────────┤
│ [+ 新建会话]                         │
└─────────────────────────────────────┘
```

### 会话切换交互

1. 点击运行中会话 → 立即切换，显示实时消息
2. 点击历史会话 → 切换，加载历史消息
3. 点击"新建会话" → 创建新会话，自动切换

---

## 兼容性考虑

### 保持现有 A2A API 兼容

- 现有的 SSE 端点继续支持（用于向后兼容）
- 新的 SignalR 端点并行运行
- 前端可以选择使用 SSE 或 SignalR

### 数据迁移

- 现有任务数据可以导入为会话
- 支持从旧格式升级到新格式

---

## 性能优化

### 消息分页

- 历史消息按分页加载（每页 50 条）
- 避免一次性加载大量消息

### 数据库索引

```csharp
// SessionEntity
modelBuilder.Entity<SessionEntity>()
    .HasIndex(s => s.ProjectId);

modelBuilder.Entity<SessionEntity>()
    .HasIndex(s => s.State);

// SessionMessageEntity
modelBuilder.Entity<SessionMessageEntity>()
    .HasIndex(m => m.SessionId);

modelBuilder.Entity<SessionMessageEntity>()
    .HasIndex(m => m.CreatedAtUtc);
```

### SignalR 连接管理

- 自动重连机制
- 连接超时处理
- 心跳检测

---

## 错误处理

### 会话不存在

```
GET /api/sessions/{sessionId}
Response: 404 Not Found
{
  "error": "Session not found"
}
```

### 权限检查

- 验证用户有权访问项目
- 验证用户有权访问会话

### 并发控制

- 使用乐观并发控制
- 处理会话状态冲突

---

## 测试策略

### 单元测试

- SessionManager 创建/删除/查询会话
- 消息保存和检索
- 会话状态转换

### 集成测试

- SignalR 消息推送
- 会话切换流程
- 历史消息加载

### 端到端测试

- 创建会话 → 启动任务 → 接收消息 → 切换会话
- 多个并发会话
- 断线重连
