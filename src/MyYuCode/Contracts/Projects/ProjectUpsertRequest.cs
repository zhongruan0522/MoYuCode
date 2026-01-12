using MyYuCode.Data.Entities;

namespace MyYuCode.Contracts.Projects;

public sealed record ProjectUpsertRequest(
    ToolType ToolType,
    string Name,
    string WorkspacePath,
    Guid? ProviderId,
    string? Model);

