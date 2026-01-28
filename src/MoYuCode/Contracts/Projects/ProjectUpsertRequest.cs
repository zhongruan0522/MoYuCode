using MoYuCode.Data.Entities;

namespace MoYuCode.Contracts.Projects;

public sealed record ProjectUpsertRequest(
    ToolType ToolType,
    string Name,
    string WorkspacePath,
    Guid? ProviderId,
    string? Model);

