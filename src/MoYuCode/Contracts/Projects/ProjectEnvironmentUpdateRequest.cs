namespace MoYuCode.Contracts.Projects;

public sealed record ProjectEnvironmentUpdateRequest(
    Dictionary<string, string> Environment);
