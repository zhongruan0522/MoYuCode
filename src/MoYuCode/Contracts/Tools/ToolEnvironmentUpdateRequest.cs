namespace MoYuCode.Contracts.Tools;

public sealed record ToolEnvironmentUpdateRequest(
    Dictionary<string, string> Environment);
