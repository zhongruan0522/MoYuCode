namespace MyYuCode.Contracts.Git;

public sealed record GitStageRequest(
    string Path,
    string File);

