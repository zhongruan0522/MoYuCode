namespace MoYuCode.Contracts.Git;

public sealed record GitCheckoutRequest(
    string Path,
    string Branch);

