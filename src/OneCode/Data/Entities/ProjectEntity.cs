using System.ComponentModel.DataAnnotations;

namespace OneCode.Data.Entities;

public enum ToolType
{
    Codex = 0,
    ClaudeCode = 1,
}

public sealed class ProjectEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public ToolType ToolType { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = "";

    [Required]
    [MaxLength(4096)]
    public string WorkspacePath { get; set; } = "";

    public Guid? ProviderId { get; set; }

    public ProviderEntity? Provider { get; set; }

    [MaxLength(200)]
    public string? Model { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? LastStartedAtUtc { get; set; }
}

