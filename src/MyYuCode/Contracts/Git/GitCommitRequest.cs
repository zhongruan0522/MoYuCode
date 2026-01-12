namespace MyYuCode.Contracts.Git;

public sealed record GitCommitRequest(
    string Path,
    string Message);

