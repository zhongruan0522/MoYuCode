#!/usr/bin/env dotnet run
#:package CliWrap@3.6.6

using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using CliWrap;
using CliWrap.Buffered;

// Parse arguments
var args = Environment.GetCommandLineArgs().Skip(1).ToArray();
if (args.Length == 0 || args.Contains("-h") || args.Contains("--help"))
{
    PrintHelp();
    return;
}

var url = args[0];
var outputDir = GetArgValue(args, "-o", "--output") ?? ".";
var fps = double.Parse(GetArgValue(args, "--fps") ?? "1.0");
var videoOnly = args.Contains("--video-only");
var framesOnly = args.Contains("--frames-only");

var videoPath = Path.Combine(outputDir, "video.mp4");
var imagesDir = Path.Combine(outputDir, "images");

// Create output directory
Directory.CreateDirectory(outputDir);

Console.WriteLine(new string('=', 50));
Console.WriteLine("Bilibili Video Analyzer - Prepare Script");
Console.WriteLine(new string('=', 50));
Console.WriteLine($"URL: {url}");
Console.WriteLine($"Output: {outputDir}");
Console.WriteLine($"FPS: {fps}");
Console.WriteLine(new string('=', 50));

// Download video
if (!framesOnly)
{
    if (!await DownloadVideoAsync(url, videoPath))
    {
        Environment.Exit(1);
    }
}

// Extract frames
if (!videoOnly)
{
    if (!File.Exists(videoPath))
    {
        Console.WriteLine($"[ERROR] Video file not found: {videoPath}");
        Environment.Exit(1);
    }

    if (!await ExtractFramesAsync(videoPath, imagesDir, fps))
    {
        Environment.Exit(1);
    }
}

Console.WriteLine();
Console.WriteLine(new string('=', 50));
Console.WriteLine("[OK] Done!");
Console.WriteLine($"  Video: {videoPath}");
Console.WriteLine($"  Images: {imagesDir}/");
Console.WriteLine(new string('=', 50));

// === Functions ===

async Task<bool> DownloadVideoAsync(string url, string outputPath)
{
    Console.WriteLine($"[INFO] Downloading video: {url}");

    var ytDlp = FindExecutable("yt-dlp", "yt-dlp.exe");
    if (ytDlp == null)
    {
        Console.WriteLine("[ERROR] yt-dlp not found!");
        Console.WriteLine("        Install with: pip install yt-dlp");
        Console.WriteLine("        Or download from: https://github.com/yt-dlp/yt-dlp/releases");
        return false;
    }

    try
    {
        Console.WriteLine($"[INFO] Running yt-dlp...");
        var result = await Cli.Wrap(ytDlp)
            .WithArguments(new[]
            {
                "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "-o", outputPath,
                "--no-warnings",
                url
            })
            .WithValidation(CommandResultValidation.None)
            .ExecuteBufferedAsync();

        if (result.ExitCode != 0)
        {
            Console.WriteLine($"[ERROR] Download failed: {result.StandardError}");
            return false;
        }

        Console.WriteLine($"[OK] Video downloaded: {outputPath}");
        return true;
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[ERROR] Download failed: {ex.Message}");
        return false;
    }
}

async Task<bool> ExtractFramesAsync(string videoPath, string outputDir, double fps)
{
    Console.WriteLine($"[INFO] Extracting frames (fps={fps})");

    var ffmpeg = FindExecutable("ffmpeg", "ffmpeg.exe");
    if (ffmpeg == null)
    {
        Console.WriteLine("[ERROR] ffmpeg not found!");
        Console.WriteLine("        Windows: choco install ffmpeg / scoop install ffmpeg");
        Console.WriteLine("        macOS: brew install ffmpeg");
        Console.WriteLine("        Linux: sudo apt install ffmpeg");
        return false;
    }

    Directory.CreateDirectory(outputDir);
    var outputPattern = Path.Combine(outputDir, "frame_%04d.jpg");

    try
    {
        Console.WriteLine($"[INFO] Running ffmpeg...");
        var result = await Cli.Wrap(ffmpeg)
            .WithArguments(new[]
            {
                "-i", videoPath,
                "-vf", $"fps={fps}",
                "-q:v", "2",
                "-y",
                outputPattern
            })
            .WithValidation(CommandResultValidation.None)
            .ExecuteBufferedAsync();

        if (result.ExitCode != 0)
        {
            Console.WriteLine($"[ERROR] Frame extraction failed: {result.StandardError}");
            return false;
        }

        var frameCount = Directory.GetFiles(outputDir, "frame_*.jpg").Length;
        Console.WriteLine($"[OK] Frames extracted: {frameCount} images saved to {outputDir}/");
        return true;
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[ERROR] Frame extraction failed: {ex.Message}");
        return false;
    }
}

string? FindExecutable(params string[] names)
{
    // Check PATH
    var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
    var paths = pathEnv.Split(Path.PathSeparator);

    foreach (var name in names)
    {
        // Direct check
        foreach (var path in paths)
        {
            var fullPath = Path.Combine(path, name);
            if (File.Exists(fullPath)) return fullPath;
        }
    }

    // Common Windows paths
    var commonPaths = new[]
    {
        @"C:\ffmpeg\bin",
        @"C:\Program Files\ffmpeg\bin",
        @"C:\tools\ffmpeg\bin",
        Environment.ExpandEnvironmentVariables(@"%LOCALAPPDATA%\Microsoft\WinGet\Packages"),
        Environment.ExpandEnvironmentVariables(@"%USERPROFILE%\scoop\shims"),
    };

    foreach (var basePath in commonPaths)
    {
        foreach (var name in names)
        {
            var fullPath = Path.Combine(basePath, name);
            if (File.Exists(fullPath)) return fullPath;
        }
    }

    // Try which/where command
    try
    {
        var cmd = OperatingSystem.IsWindows() ? "where" : "which";
        var result = Process.Start(new ProcessStartInfo
        {
            FileName = cmd,
            Arguments = names[0],
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true
        });
        result?.WaitForExit();
        var output = result?.StandardOutput.ReadToEnd()?.Trim();
        if (!string.IsNullOrEmpty(output) && File.Exists(output.Split('\n')[0]))
        {
            return output.Split('\n')[0].Trim();
        }
    }
    catch { }

    return null;
}

string? GetArgValue(string[] args, params string[] names)
{
    for (int i = 0; i < args.Length - 1; i++)
    {
        if (names.Contains(args[i]))
        {
            return args[i + 1];
        }
    }
    return null;
}

void PrintHelp()
{
    Console.WriteLine(@"
Bilibili Video Analyzer - Prepare Script

Usage:
  dotnet run prepare.cs <url> [options]

Arguments:
  url                    Bilibili video URL (required)

Options:
  -o, --output <dir>     Output directory (default: current)
  --fps <value>          Frames per second (default: 1.0)
  --video-only           Only download video, skip frame extraction
  --frames-only          Only extract frames (requires existing video.mp4)
  -h, --help             Show this help

Examples:
  dotnet run prepare.cs ""https://www.bilibili.com/video/BV1xx411c7mD""
  dotnet run prepare.cs ""https://www.bilibili.com/video/BV1xx411c7mD"" --fps 0.5
  dotnet run prepare.cs ""https://www.bilibili.com/video/BV1xx411c7mD"" -o ./output

Requirements:
  - yt-dlp: pip install yt-dlp
  - ffmpeg: https://ffmpeg.org/download.html
");
}
