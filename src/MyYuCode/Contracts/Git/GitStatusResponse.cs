namespace MyYuCode.Contracts.Git;

public sealed record GitStatusResponse(
    string RepoRoot,
    string? Branch,
    IReadOnlyList<GitStatusEntryDto> Entries);

