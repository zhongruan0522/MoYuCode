using System.ComponentModel.DataAnnotations;

namespace MoYuCode.Data.Entities;

/// <summary>
/// 消息角色枚举
/// </summary>
public enum MessageRole
{
    User = 0,
    Agent = 1,
    System = 2
}

/// <summary>
/// 消息类型枚举
/// </summary>
public enum MessageType
{
    Text = 0,
    Tool = 1,
    Status = 2,
    Artifact = 3,
    TokenUsage = 4
}

/// <summary>
/// 会话消息实体，用于持久化存储会话消息
/// </summary>
public sealed class SessionMessageEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid SessionId { get; set; }

    public MessageRole Role { get; set; } = MessageRole.User;

    [Required]
    public string Content { get; set; } = "";

    public MessageType MessageType { get; set; } = MessageType.Text;

    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}
