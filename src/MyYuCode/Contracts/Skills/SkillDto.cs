namespace MyYuCode.Contracts.Skills;

public sealed record SkillDto(
    string Slug,
    string Name,
    string Summary,
    string Description,
    string Visibility,
    IReadOnlyList<string> Tags,
    SkillServicesDto Services,
    string Version,
    string BuildId,
    string Status,
    string UpdatedAt);
