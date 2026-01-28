namespace MoYuCode.Contracts.FileSystem;

public sealed record ListDirectoriesResponse(
    string CurrentPath,
    string? ParentPath,
    IReadOnlyList<DirectoryEntryDto> Directories);

