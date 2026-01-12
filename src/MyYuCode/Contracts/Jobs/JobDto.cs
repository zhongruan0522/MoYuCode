namespace MyYuCode.Contracts.Jobs;

public enum JobStatus
{
    Pending = 0,
    Running = 1,
    Succeeded = 2,
    Failed = 3,
}

public sealed record JobDto(
    Guid Id,
    string Kind,
    JobStatus Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? StartedAtUtc,
    DateTimeOffset? FinishedAtUtc,
    int? ExitCode,
    IReadOnlyList<string> Logs);

