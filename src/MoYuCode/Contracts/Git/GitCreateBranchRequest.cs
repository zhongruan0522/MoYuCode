namespace MoYuCode.Contracts.Git;

public sealed record GitCreateBranchRequest(
    string Path,
    string Branch,
    bool Checkout,
    string? StartPoint = null);

