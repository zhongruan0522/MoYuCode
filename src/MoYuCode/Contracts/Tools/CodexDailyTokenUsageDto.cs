using MoYuCode.Contracts.Projects;

namespace MoYuCode.Contracts.Tools;

public sealed record CodexDailyTokenUsageDto(
    string Date,
    SessionTokenUsageDto TokenUsage);

