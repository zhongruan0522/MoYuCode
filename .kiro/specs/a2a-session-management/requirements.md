# 需求文档

## 简介

重构 A2A（Agent-to-Agent）会话管理逻辑，将现有的内存存储 + SSE 流式推送架构改为持久化存储 + SignalR 实时推送架构。主要目标是实现会话与项目的绑定、消息持久化存储、以及更可靠的实时消息推送机制。

## 术语表

- **Session（会话）**: 一次完整的 A2A 对话上下文，包含多条消息
- **Session_Manager（会话管理器）**: 负责会话生命周期管理的后端服务
- **Message（消息）**: 会话中的单条消息，可以是用户消息或 Agent 消息
- **SignalR_Hub（SignalR 中心）**: ASP.NET Core SignalR 的消息推送中心
- **Project（项目）**: 用户的工作项目，与会话关联
- **A2a_Task_Manager（A2A 任务管理器）**: 现有的任务执行管理器

## 需求

### 需求 1：会话实体与持久化

**用户故事：** 作为用户，我希望我的对话历史能够被保存，以便下次打开项目时能够继续之前的对话。

#### 验收标准

1. THE Session_Manager SHALL 创建 SessionEntity 实体，包含 Id、ProjectId、CreatedAtUtc、UpdatedAtUtc 字段
2. THE Session_Manager SHALL 创建 SessionMessageEntity 实体，包含 Id、SessionId、Role、Content、CreatedAtUtc 字段
3. WHEN 用户发送消息时，THE Session_Manager SHALL 将消息持久化到 JSON 文件存储
4. WHEN 会话创建时，THE Session_Manager SHALL 生成唯一的会话 ID 并关联到项目
5. THE Session_Manager SHALL 支持按会话 ID 加载历史消息

### 需求 2：项目与会话绑定

**用户故事：** 作为用户，我希望每个项目能记住最近一次使用的会话，以便下次进入项目时自动加载。

#### 验收标准

1. THE ProjectEntity SHALL 新增 CurrentSessionId 字段，记录当前活跃会话 ID
2. WHEN 用户在项目中开始新会话时，THE Session_Manager SHALL 更新项目的 CurrentSessionId
3. WHEN 用户进入项目工作区时，THE System SHALL 自动加载项目关联的当前会话
4. THE Session_Manager SHALL 支持一个项目拥有多个历史会话
5. WHEN 用户切换会话时，THE Session_Manager SHALL 更新项目的 CurrentSessionId

### 需求 3：SignalR 实时消息推送

**用户故事：** 作为用户，我希望能够实时接收 Agent 的响应消息，而不需要轮询或刷新页面。

#### 验收标准

1. THE SignalR_Hub SHALL 创建 A2aSessionHub 类，处理会话相关的实时通信
2. WHEN 客户端连接时，THE SignalR_Hub SHALL 支持按会话 ID 加入对应的 SignalR 组
3. WHEN A2a_Task_Manager 产生新消息时，THE SignalR_Hub SHALL 将消息推送到对应会话的所有连接客户端
4. THE SignalR_Hub SHALL 支持推送以下消息类型：文本增量、状态更新、工具调用、错误信息
5. WHEN 客户端断开连接后重连时，THE System SHALL 支持从上次接收的消息位置继续接收

### 需求 4：前端 SignalR 集成

**用户故事：** 作为用户，我希望前端能够稳定地接收实时消息，并在断线后自动重连。

#### 验收标准

1. THE Frontend SHALL 使用 @microsoft/signalr 库建立 SignalR 连接
2. WHEN 进入项目工作区时，THE Frontend SHALL 自动建立 SignalR 连接并加入当前会话组
3. WHEN SignalR 连接断开时，THE Frontend SHALL 自动尝试重连
4. WHEN 重连成功后，THE Frontend SHALL 请求加载断线期间的消息
5. THE Frontend SHALL 替换现有的 SSE 流式接收逻辑为 SignalR 接收

### 需求 5：历史消息加载

**用户故事：** 作为用户，我希望能够查看之前的对话历史，并在需要时加载更多历史消息。

#### 验收标准

1. WHEN 用户进入项目工作区时，THE System SHALL 加载当前会话的最近消息
2. THE System SHALL 支持分页加载历史消息，每页默认 30 条
3. WHEN 用户滚动到消息列表顶部时，THE Frontend SHALL 自动加载更早的历史消息
4. THE API SHALL 提供按会话 ID 查询消息的端点，支持分页和游标参数
5. IF 会话不存在，THEN THE System SHALL 创建新会话并返回空消息列表

### 需求 6：后台任务执行

**用户故事：** 作为用户，我希望 A2A 对话能在后台持续执行，即使我暂时离开页面也不会中断。

#### 验收标准

1. WHEN 用户发送消息后，THE A2a_Task_Manager SHALL 在后台继续执行任务
2. THE A2a_Task_Manager SHALL 将执行过程中的消息实时保存到会话存储
3. WHEN 用户重新打开页面时，THE System SHALL 显示后台执行期间产生的所有消息
4. IF 后台任务执行失败，THEN THE System SHALL 记录错误信息到会话消息中
5. THE A2a_Task_Manager SHALL 通过 SignalR 推送消息，而非 SSE 流

### 需求 7：会话管理 API

**用户故事：** 作为开发者，我希望有清晰的 API 来管理会话的创建、查询和切换。

#### 验收标准

1. THE API SHALL 提供 POST /api/sessions 端点创建新会话
2. THE API SHALL 提供 GET /api/sessions/{sessionId}/messages 端点查询会话消息
3. THE API SHALL 提供 GET /api/projects/{projectId}/sessions 端点查询项目的所有会话
4. THE API SHALL 提供 PUT /api/projects/{projectId}/current-session 端点切换当前会话
5. WHEN 创建会话时，THE API SHALL 返回会话 ID 和初始状态
