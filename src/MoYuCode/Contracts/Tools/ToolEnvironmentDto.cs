using MoYuCode.Data.Entities;

namespace MoYuCode.Contracts.Tools;

public sealed record ToolEnvironmentDto(
    ToolType ToolType,
    IReadOnlyDictionary<string, string> Environment);
