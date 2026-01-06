namespace OneCode.Contracts.Git;

public sealed record GitBranchesResponse(
    string RepoRoot,
    string? Current,
    IReadOnlyList<string> Branches);

