namespace MoYuCode.Contracts.App;

public sealed record AppVersionDto(
    string Version,
    string? InformationalVersion,
    string? AssemblyVersion);

