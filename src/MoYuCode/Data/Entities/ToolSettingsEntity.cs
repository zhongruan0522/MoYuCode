namespace MoYuCode.Data.Entities;

public sealed class ToolSettingsEntity
{
    public ToolType ToolType { get; set; }

    public Dictionary<string, string> LaunchEnvironment { get; set; } = new(StringComparer.Ordinal);

    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}
