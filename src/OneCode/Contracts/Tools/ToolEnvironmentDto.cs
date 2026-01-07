using OneCode.Data.Entities;

namespace OneCode.Contracts.Tools;

public sealed record ToolEnvironmentDto(
    ToolType ToolType,
    IReadOnlyDictionary<string, string> Environment);
