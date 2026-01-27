# 会话管理重构实现任务列表

## 1. 数据库模型和迁移

- [x] 1.1 创建 SessionEntity 类
- [x] 1.2 创建 SessionMessageEntity 类
- [x] 1.3 扩展 ProjectEntity，添加 CurrentSessionId 和 Sessions 导航属性
- [x] 1.4 创建数据库迁移脚本
- [x] 1.5 添加数据库索引优化查询性能

## 2. 后端服务层

- [x] 2.1 创建 SessionManager 服务
  - [x] 2.1.1 实现创建会话方法
  - [x] 2.1.2 实现删除会话方法
  - [x] 2.1.3 实现查询项目会话列表方法
  - [x] 2.1.4 实现查询运行中会话方法
  - [x] 2.1.5 实现切换当前会话方法
- [x] 2.2 创建 SessionMessageRepository 用于消息持久化
  - [x] 2.2.1 实现保存消息方法
  - [x] 2.2.2 实现分页查询消息方法
  - [x] 2.2.3 实现删除会话消息方法

## 3. SignalR Hub 实现

- [x] 3.1 创建 ChatHub 类
  - [x] 3.1.1 实现 JoinSession 方法
  - [x] 3.1.2 实现 LeaveSession 方法
  - [x] 3.1.3 实现连接/断开连接处理
- [x] 3.2 在 Program.cs 中注册 SignalR 服务
- [x] 3.3 配置 SignalR 端点

## 4. A2aTaskManager 改进

- [x] 4.1 注入 IHubContext<ChatHub> 和 SessionManager
- [x] 4.2 修改任务启动流程
  - [x] 4.2.1 创建 SessionEntity
  - [x] 4.2.2 关联任务到会话
- [x] 4.3 修改消息推送逻辑
  - [x] 4.3.1 保存消息到 SessionMessageEntity
  - [x] 4.3.2 通过 SignalR 推送消息
  - [x] 4.3.3 保持 SSE 兼容性（可选）
- [x] 4.4 修改任务完成逻辑
  - [x] 4.4.1 更新会话状态为 COMPLETED/FAILED/CANCELLED
  - [x] 4.4.2 记录完成时间

## 5. API 端点实现

- [x] 5.1 创建 SessionsEndpoints 类
  - [x] 5.1.1 POST /api/sessions - 创建会话
  - [x] 5.1.2 GET /api/projects/{projectId}/sessions - 获取项目会话列表
  - [x] 5.1.3 GET /api/sessions/running - 获取运行中会话
  - [x] 5.1.4 PUT /api/projects/{projectId}/current-session - 切换当前会话
  - [x] 5.1.5 GET /api/sessions/{sessionId}/messages - 获取会话消息
  - [x] 5.1.6 DELETE /api/sessions/{sessionId} - 删除会话
- [x] 5.2 创建 DTO 类
  - [x] 5.2.1 SessionDto
  - [x] 5.2.2 SessionMessageDto
  - [x] 5.2.3 CreateSessionRequest
  - [x] 5.2.4 SwitchSessionRequest

## 6. 前端 SignalR 集成

- [x] 6.1 创建 SignalR 连接管理 Hook
  - [x] 6.1.1 useSignalRConnection Hook
  - [x] 6.1.2 自动重连逻辑
  - [x] 6.1.3 连接状态管理
- [x] 6.2 创建会话管理 Hook
  - [x] 6.2.1 useSessionManager Hook
  - [x] 6.2.2 会话列表状态
  - [x] 6.2.3 当前会话状态
- [x] 6.3 修改 ProjectChat 组件
  - [x] 6.3.1 集成 SignalR 连接
  - [x] 6.3.2 显示会话列表面板
  - [x] 6.3.3 显示运行中会话指示器
  - [x] 6.3.4 实现会话切换功能
  - [x] 6.3.5 实现创建新会话功能

## 7. 前端 UI 组件

- [x] 7.1 创建 SessionPanel 组件
  - [x] 7.1.1 运行中会话列表
  - [x] 7.1.2 历史会话列表
  - [x] 7.1.3 新建会话按钮
- [x] 7.2 创建 SessionItem 组件
  - [x] 7.2.1 会话标题和状态
  - [x] 7.2.2 消息计数
  - [x] 7.2.3 创建时间
  - [x] 7.2.4 点击切换功能
- [x] 7.3 创建 RunningSessionsIndicator 组件
  - [x] 7.3.1 显示运行中会话数量
  - [x] 7.3.2 快速访问运行中会话

## 8. 消息处理和同步

- [x] 8.1 实现消息接收处理
  - [x] 8.1.1 处理文本消息
  - [x] 8.1.2 处理工具调用消息
  - [x] 8.1.3 处理状态更新消息
  - [x] 8.1.4 处理 Token 使用量消息
- [x] 8.2 实现历史消息加载
  - [x] 8.2.1 分页加载历史消息
  - [x] 8.2.2 合并历史消息和实时消息
  - [x] 8.2.3 处理消息顺序

## 9. 测试

- [x] 9.1 后端单元测试
  - [x] 9.1.1 SessionManager 测试
  - [x] 9.1.2 SessionMessageRepository 测试
  - [ ] 9.1.3 A2aTaskManager 集成测试
- [x] 9.2 前端单元测试
  - [x] 9.2.1 useSignalRConnection Hook 测试
  - [x] 9.2.2 useSessionManager Hook 测试
  - [x] 9.2.3 SessionPanel 组件测试
- [ ] 9.3 集成测试
  - [ ] 9.3.1 创建会话 → 启动任务 → 接收消息
  - [ ] 9.3.2 会话切换流程
  - [ ] 9.3.3 历史消息加载
  - [ ] 9.3.4 断线重连

## 10. 文档和清理

- [ ] 10.1 更新 API 文档
- [ ] 10.2 更新前端组件文档
- [ ] 10.3 添加迁移指南
- [ ] 10.4 清理过时代码（如果有）
- [ ] 10.5 性能测试和优化

## 优先级说明

**高优先级（必须完成）**：1, 2, 3, 4, 5, 6, 8

**中优先级（应该完成）**：7, 9

**低优先级（可选）**：10
