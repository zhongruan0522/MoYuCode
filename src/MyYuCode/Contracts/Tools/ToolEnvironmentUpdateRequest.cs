namespace MyYuCode.Contracts.Tools;

public sealed record ToolEnvironmentUpdateRequest(
    Dictionary<string, string> Environment);
