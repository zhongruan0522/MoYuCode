namespace MyYuCode.Contracts.Git;

public sealed record GitCommitDiffResponse(
    string Hash,
    string Diff,
    bool Truncated,
    IReadOnlyList<string> Files);

