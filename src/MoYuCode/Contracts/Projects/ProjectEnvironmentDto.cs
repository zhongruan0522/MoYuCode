namespace MoYuCode.Contracts.Projects;

public sealed record ProjectEnvironmentDto(
    Guid ProjectId,
    IReadOnlyDictionary<string, string> Environment);
