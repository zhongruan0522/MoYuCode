namespace MoYuCode.Contracts.Git;

public sealed record GitUnstageRequest(
    string Path,
    string File);

