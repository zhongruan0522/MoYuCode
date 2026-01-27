using System.ComponentModel.DataAnnotations;

namespace MyYuCode.Data.Entities;

/// <summary>
/// 会话状态枚举
/// </summary>
public enum SessionState
{
    Idle = 0,
    Running = 1,
    Completed = 2,
    Failed = 3,
    Cancelled = 4
}

/// <summary>
/// 会话实体，用于持久化存储会话信息
/// </summary>
public sealed class SessionEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid ProjectId { get; set; }

    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = "";

    public SessionState State { get; set; } = SessionState.Idle;

    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? CompletedAtUtc { get; set; }

    /// <summary>
    /// 消息计数（用于列表显示，避免加载所有消息）
    /// </summary>
    public int MessageCount { get; set; }
}
