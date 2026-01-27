namespace MyYuCode.Contracts.Sessions;

/// <summary>
/// 会话 DTO
/// </summary>
public sealed class SessionDto
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public string? ProjectName { get; set; }
    public string Title { get; set; } = "";
    public string State { get; set; } = "IDLE";
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }
    public DateTimeOffset? CompletedAtUtc { get; set; }
    public int MessageCount { get; set; }
}

/// <summary>
/// 会话消息 DTO
/// </summary>
public sealed class SessionMessageDto
{
    public Guid Id { get; set; }
    public string Role { get; set; } = "user";
    public string Content { get; set; } = "";
    public string MessageType { get; set; } = "text";
    public DateTimeOffset CreatedAtUtc { get; set; }
}

/// <summary>
/// 创建会话请求
/// </summary>
public sealed class CreateSessionRequest
{
    public Guid ProjectId { get; set; }
    public string? Title { get; set; }
}

/// <summary>
/// 切换会话请求
/// </summary>
public sealed class SwitchSessionRequest
{
    public Guid SessionId { get; set; }
}

/// <summary>
/// 更新会话请求
/// </summary>
public sealed class UpdateSessionRequest
{
    public string? Title { get; set; }
}

/// <summary>
/// 会话列表响应
/// </summary>
public sealed class SessionListResponse
{
    public List<SessionDto> Sessions { get; set; } = [];
}

/// <summary>
/// 会话消息列表响应
/// </summary>
public sealed class SessionMessagesResponse
{
    public List<SessionMessageDto> Messages { get; set; } = [];
    public int Total { get; set; }
}

/// <summary>
/// 切换会话响应
/// </summary>
public sealed class SwitchSessionResponse
{
    public bool Success { get; set; }
    public Guid? CurrentSessionId { get; set; }
}
