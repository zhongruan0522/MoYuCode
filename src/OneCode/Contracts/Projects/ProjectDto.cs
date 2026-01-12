using OneCode.Data.Entities;

namespace OneCode.Contracts.Projects;

public sealed record ProjectDto(
    Guid Id,
    ToolType ToolType,
    string Name,
    string WorkspacePath,
    Guid? ProviderId,
    string? ProviderName,
    string? Model,
    bool IsPinned,
    DateTimeOffset? LastStartedAtUtc,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc);

