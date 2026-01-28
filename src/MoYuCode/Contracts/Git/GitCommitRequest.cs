namespace MoYuCode.Contracts.Git;

public sealed record GitCommitRequest(
    string Path,
    string Message);

