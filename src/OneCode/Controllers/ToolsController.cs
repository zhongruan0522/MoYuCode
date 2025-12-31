using System.Diagnostics;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using OneCode.Contracts.Jobs;
using OneCode.Contracts.Tools;
using OneCode.Services.Jobs;

namespace OneCode.Controllers;

[ApiController]
[Route("api/tools")]
public sealed class ToolsController(JobManager jobManager) : ControllerBase
{
    [HttpGet("codex/status")]
    public async Task<ActionResult<ToolStatusDto>> GetCodexStatus(CancellationToken cancellationToken)
    {
        var configPath = GetCodexConfigPath();
        var status = await GetToolStatusAsync(
            toolName: "codex",
            versionArgs: "--version",
            configPath: configPath,
            parseVersion: ParseCodexVersion,
            cancellationToken);

        return Ok(status);
    }

    [HttpGet("claude/status")]
    public async Task<ActionResult<ToolStatusDto>> GetClaudeStatus(CancellationToken cancellationToken)
    {
        var configPath = GetClaudeSettingsPath();
        var status = await GetToolStatusAsync(
            toolName: "claude",
            versionArgs: "--version",
            configPath: configPath,
            parseVersion: ParseClaudeVersion,
            cancellationToken);

        return Ok(status);
    }

    [HttpPost("codex/install")]
    public ActionResult<JobDto> InstallCodex()
    {
        var job = jobManager.StartProcessJob(
            kind: "install:codex",
            fileName: "npm",
            arguments: "install -g @openai/codex");

        return Accepted(job);
    }

    [HttpPost("claude/install")]
    public ActionResult<JobDto> InstallClaude()
    {
        var job = jobManager.StartProcessJob(
            kind: "install:claude",
            fileName: "npm",
            arguments: "install -g @anthropic-ai/claude-code");

        return Accepted(job);
    }

    private static string GetCodexConfigPath()
    {
        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var codexHome = Environment.GetEnvironmentVariable("CODEX_HOME");
        var resolvedHome = string.IsNullOrWhiteSpace(codexHome)
            ? Path.Combine(userProfile, ".codex")
            : codexHome;
        return Path.Combine(resolvedHome, "config.toml");
    }

    private static string GetClaudeSettingsPath()
    {
        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var claudeConfigDir = Environment.GetEnvironmentVariable("CLAUDE_CONFIG_DIR");
        var resolvedDir = string.IsNullOrWhiteSpace(claudeConfigDir)
            ? Path.Combine(userProfile, ".claude")
            : claudeConfigDir;
        return Path.Combine(resolvedDir, "settings.json");
    }

    private static async Task<ToolStatusDto> GetToolStatusAsync(
        string toolName,
        string versionArgs,
        string configPath,
        Func<string, string?> parseVersion,
        CancellationToken cancellationToken)
    {
        var configExists = System.IO.File.Exists(configPath);

        var exePath = await TryRunAndReadFirstLineAsync(
            fileName: "where.exe",
            arguments: toolName,
            timeoutMs: 2000,
            cancellationToken);

        var npmBin = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "npm");

        var environment = new Dictionary<string, string>(StringComparer.Ordinal);
        if (Directory.Exists(npmBin))
        {
            var existingPath = Environment.GetEnvironmentVariable("PATH") ?? "";
            if (!existingPath.Split(';', StringSplitOptions.RemoveEmptyEntries).Contains(npmBin, StringComparer.OrdinalIgnoreCase))
            {
                environment["PATH"] = $"{npmBin};{existingPath}";
            }
        }

        string? versionOutput = null;

        // Prefer absolute path from `where` so we don't depend on the service PATH.
        if (!string.IsNullOrWhiteSpace(exePath))
        {
            versionOutput = await TryRunAndReadFirstLineAsync(
                fileName: "cmd.exe",
                arguments: $"/c \"\"{exePath}\" {versionArgs}\"",
                timeoutMs: 15000,
                cancellationToken,
                environment);
        }

        // Fallback to npm global bin shims.
        if (string.IsNullOrWhiteSpace(versionOutput) && Directory.Exists(npmBin))
        {
            var shim = Path.Combine(npmBin, $"{toolName}.cmd");
            if (System.IO.File.Exists(shim))
            {
                versionOutput = await TryRunAndReadFirstLineAsync(
                    fileName: "cmd.exe",
                    arguments: $"/c \"\"{shim}\" {versionArgs}\"",
                    timeoutMs: 15000,
                    cancellationToken,
                    environment);
            }
        }

        // Last resort: rely on PATH.
        if (string.IsNullOrWhiteSpace(versionOutput))
        {
            versionOutput = await TryRunAndReadFirstLineAsync(
                fileName: "cmd.exe",
                arguments: $"/c \"{toolName} {versionArgs}\"",
                timeoutMs: 15000,
                cancellationToken,
                environment);
        }

        var installed = !string.IsNullOrWhiteSpace(versionOutput);
        var version = installed ? parseVersion(versionOutput!) : null;

        return new ToolStatusDto(
            Installed: installed,
            Version: version,
            ExecutablePath: exePath,
            ConfigPath: configPath,
            ConfigExists: configExists);
    }

    private static string? ParseCodexVersion(string versionLine)
    {
        // Example: "codex-cli 0.77.0"
        var tokens = versionLine.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return tokens.Length >= 2 ? tokens[1] : versionLine.Trim();
    }

    private static string? ParseClaudeVersion(string versionLine)
    {
        // Example: "2.0.76 (Claude Code)"
        var tokens = versionLine.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return tokens.Length >= 1 ? tokens[0] : versionLine.Trim();
    }

    private static async Task<string?> TryRunAndReadFirstLineAsync(
        string fileName,
        string arguments,
        int timeoutMs,
        CancellationToken cancellationToken,
        IReadOnlyDictionary<string, string>? environment = null)
    {
        try
        {
            using var process = new Process();
            process.StartInfo = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };

            if (environment is not null)
            {
                foreach (var (key, value) in environment)
                {
                    process.StartInfo.Environment[key] = value;
                }
            }

            process.Start();

            var readTask = process.StandardOutput.ReadLineAsync(cancellationToken).AsTask();
            var delayTask = Task.Delay(timeoutMs, cancellationToken);

            var completed = await Task.WhenAny(readTask, delayTask);
            if (completed != readTask)
            {
                try
                {
                    if (!process.HasExited)
                    {
                        process.Kill(entireProcessTree: true);
                    }
                }
                catch
                {
                    // ignore
                }
                return null;
            }

            return await readTask;
        }
        catch
        {
            return null;
        }
    }
}
