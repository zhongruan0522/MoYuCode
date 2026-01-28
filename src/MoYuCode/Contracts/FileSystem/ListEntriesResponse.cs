namespace MoYuCode.Contracts.FileSystem;

public sealed record ListEntriesResponse(
    string CurrentPath,
    string? ParentPath,
    IReadOnlyList<DirectoryEntryDto> Directories,
    IReadOnlyList<FileEntryDto> Files);

