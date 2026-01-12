using System.Diagnostics;
using System.Text;

namespace MyYuCode.Services.Shell;

public sealed class PowerShellLauncher(ILogger<PowerShellLauncher> logger)
{
    public void LaunchNewWindow(
        string workingDirectory,
        string windowTitle,
        string command,
        IReadOnlyDictionary<string, string>? environment = null)
    {
        var script = BuildStartProcessScript(workingDirectory, windowTitle, command);
        var encodedCommand = EncodePowerShellCommand(script);

        var startInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-NoProfile -EncodedCommand {encodedCommand}",
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        if (environment is not null)
        {
            foreach (var (key, value) in environment)
            {
                startInfo.Environment[key] = value;
            }
        }

        try
        {
            Process.Start(startInfo);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to launch PowerShell window.");
            throw;
        }
    }

    private static string BuildStartProcessScript(string workingDirectory, string windowTitle, string command)
    {
        var wd = EscapeSingleQuoted(workingDirectory);
        var title = EscapeSingleQuoted(windowTitle);

        // No secrets should be embedded in this script. Any secret values should be passed
        // as environment variables from the parent process.
        return $"""
$ErrorActionPreference = 'Stop'
$launchCommand = @'
$host.UI.RawUI.WindowTitle = '{title}'
{command}
'@
Start-Process powershell.exe -WorkingDirectory '{wd}' -ArgumentList @('-NoExit','-Command',$launchCommand)
""";
    }

    private static string EncodePowerShellCommand(string script)
    {
        // PowerShell's -EncodedCommand expects UTF-16LE.
        var bytes = Encoding.Unicode.GetBytes(script);
        return Convert.ToBase64String(bytes);
    }

    private static string EscapeSingleQuoted(string value)
    {
        return value.Replace("'", "''", StringComparison.Ordinal);
    }
}

