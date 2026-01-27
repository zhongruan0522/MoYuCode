namespace MyYuCode.Contracts.Skills;

public record SkillInstallResponse(
    bool Success,
    string InstalledPath,
    IReadOnlyList<string> FilesInstalled,
    string? ErrorMessage = null
);
