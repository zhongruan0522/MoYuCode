using MyYuCode.Contracts.Projects;

namespace MyYuCode.Contracts.Tools;

public sealed record CodexDailyTokenUsageDto(
    string Date,
    SessionTokenUsageDto TokenUsage);

