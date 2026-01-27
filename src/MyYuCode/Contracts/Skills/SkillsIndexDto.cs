namespace MyYuCode.Contracts.Skills;

public sealed record SkillsIndexDto(
    int Version,
    string GeneratedAt,
    IReadOnlyList<SkillDto> Skills);
