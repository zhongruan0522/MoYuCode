namespace MoYuCode.Contracts.Git;

public sealed record GitLogResponse(
    string RepoRoot,
    string? Branch,
    IReadOnlyList<string> Lines);

