namespace MoYuCode.Contracts.FileSystem;

public sealed record ReadFileResponse(
    string Path,
    string Content,
    bool Truncated,
    bool IsBinary,
    long SizeBytes);

