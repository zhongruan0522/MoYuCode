using MyYuCode.Data.Entities;

namespace MyYuCode.Contracts.Tools;

public sealed record ToolEnvironmentDto(
    ToolType ToolType,
    IReadOnlyDictionary<string, string> Environment);
