namespace OneCode.Contracts.Projects;

public sealed record ProjectEnvironmentUpdateRequest(
    Dictionary<string, string> Environment);
