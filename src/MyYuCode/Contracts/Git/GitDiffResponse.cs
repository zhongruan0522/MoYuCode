namespace MyYuCode.Contracts.Git;

public sealed record GitDiffResponse(
    string File,
    string Diff,
    bool Truncated);

