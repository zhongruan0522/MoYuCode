using OneCode.Data.Entities;

namespace OneCode.Contracts.Projects;

public sealed record ProjectUpsertRequest(
    ToolType ToolType,
    string Name,
    string WorkspacePath,
    Guid? ProviderId,
    string? Model);

