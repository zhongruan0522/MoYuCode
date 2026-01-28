namespace MoYuCode.Contracts.Skills;

public sealed record SkillDto(
    string Slug,
    string Name,
    string Summary,
    string Description,
    string Visibility,
    IReadOnlyList<string> Tags,
    SkillServicesDto Services,
    SkillPackageDto? Package,
    string Version,
    string BuildId,
    string Status,
    string UpdatedAt);

public sealed record SkillPackageDto(
    string BasePath,
    IReadOnlyList<SkillPackageFileDto> Files);

public sealed record SkillPackageFileDto(
    string Path);
