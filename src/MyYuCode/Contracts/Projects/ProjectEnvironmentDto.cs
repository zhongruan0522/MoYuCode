namespace MyYuCode.Contracts.Projects;

public sealed record ProjectEnvironmentDto(
    Guid ProjectId,
    IReadOnlyDictionary<string, string> Environment);
