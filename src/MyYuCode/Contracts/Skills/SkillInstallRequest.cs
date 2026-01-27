namespace MyYuCode.Contracts.Skills;

public record SkillInstallRequest(
    string Slug,
    string TargetService
);
