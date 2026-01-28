namespace MoYuCode.Contracts.Skills;

public record SkillInstallRequest(
    string Slug,
    string TargetService
);
