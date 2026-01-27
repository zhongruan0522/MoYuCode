#!/usr/bin/env dotnet run

using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

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
    if (!await DownloadBilibiliVideoAsync(url, videoPath))
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

async Task<bool> DownloadBilibiliVideoAsync(string url, string outputPath)
{
    Console.WriteLine($"[INFO] Downloading video: {url}");

    try
    {
        // Extract BV ID from URL
        var bvid = ExtractBvid(url);
        if (string.IsNullOrEmpty(bvid))
        {
            Console.WriteLine("[ERROR] Invalid Bilibili URL, cannot extract BV ID");
            return false;
        }
        Console.WriteLine($"[INFO] BV ID: {bvid}");

        using var client = CreateHttpClient();

        // Step 1: Get video info to obtain cid
        Console.WriteLine("[INFO] Fetching video info...");
        var infoUrl = $"https://api.bilibili.com/x/web-interface/view?bvid={bvid}";
        var infoJson = await client.GetStringAsync(infoUrl);
        using var infoDoc = JsonDocument.Parse(infoJson);

        var code = infoDoc.RootElement.GetProperty("code").GetInt32();
        if (code != 0)
        {
            var message = infoDoc.RootElement.GetProperty("message").GetString();
            Console.WriteLine($"[ERROR] Failed to get video info: {message}");
            return false;
        }

        var data = infoDoc.RootElement.GetProperty("data");
        var title = data.GetProperty("title").GetString();
        var cid = data.GetProperty("cid").GetInt64();
        Console.WriteLine($"[INFO] Title: {title}");
        Console.WriteLine($"[INFO] CID: {cid}");

        // Step 2: Get playback URL
        Console.WriteLine("[INFO] Fetching playback URL...");
        var playUrl = $"https://api.bilibili.com/x/player/playurl?bvid={bvid}&cid={cid}&qn=80&fnval=1";
        var playJson = await client.GetStringAsync(playUrl);
        using var playDoc = JsonDocument.Parse(playJson);

        var playCode = playDoc.RootElement.GetProperty("code").GetInt32();
        if (playCode != 0)
        {
            var message = playDoc.RootElement.GetProperty("message").GetString();
            Console.WriteLine($"[ERROR] Failed to get playback URL: {message}");
            return false;
        }

        var playData = playDoc.RootElement.GetProperty("data");
        var durl = playData.GetProperty("durl")[0];
        var videoUrl = durl.GetProperty("url").GetString();
        var size = durl.GetProperty("size").GetInt64();

        Console.WriteLine($"[INFO] Video size: {size / 1024 / 1024:F1} MB");

        // Step 3: Download video
        Console.WriteLine("[INFO] Downloading video file...");

        using var request = new HttpRequestMessage(HttpMethod.Get, videoUrl);
        request.Headers.Add("Referer", $"https://www.bilibili.com/video/{bvid}");

        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();

        var totalBytes = response.Content.Headers.ContentLength ?? size;

        await using var contentStream = await response.Content.ReadAsStreamAsync();
        await using var fileStream = new FileStream(outputPath, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true);

        var buffer = new byte[8192];
        var totalRead = 0L;
        var lastProgress = 0;
        int bytesRead;

        while ((bytesRead = await contentStream.ReadAsync(buffer, 0, buffer.Length)) > 0)
        {
            await fileStream.WriteAsync(buffer, 0, bytesRead);
            totalRead += bytesRead;

            var progress = (int)(totalRead * 100 / totalBytes);
            if (progress > lastProgress && progress % 10 == 0)
            {
                Console.WriteLine($"[INFO] Progress: {progress}%");
                lastProgress = progress;
            }
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

string? ExtractBvid(string url)
{
    // Match BV ID from various URL formats
    // https://www.bilibili.com/video/BV1xx411c7mD
    // https://b23.tv/BV1xx411c7mD
    // BV1xx411c7mD
    var patterns = new[]
    {
        @"BV[a-zA-Z0-9]+",
    };

    foreach (var pattern in patterns)
    {
        var match = Regex.Match(url, pattern);
        if (match.Success)
        {
            return match.Value;
        }
    }

    return null;
}

HttpClient CreateHttpClient()
{
    var handler = new HttpClientHandler
    {
        AutomaticDecompression = System.Net.DecompressionMethods.GZip | System.Net.DecompressionMethods.Deflate
    };

    var client = new HttpClient(handler);
    client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    client.DefaultRequestHeaders.Add("Referer", "https://www.bilibili.com");
    client.DefaultRequestHeaders.Add("Accept", "application/json, text/plain, */*");
    client.Timeout = TimeSpan.FromMinutes(30);

    return client;
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

        var psi = new ProcessStartInfo
        {
            FileName = ffmpeg,
            Arguments = $"-i \"{videoPath}\" -vf \"fps={fps}\" -q:v 2 -y \"{outputPattern}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(psi);
        if (process == null)
        {
            Console.WriteLine("[ERROR] Failed to start ffmpeg");
            return false;
        }

        var stderr = await process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();

        if (process.ExitCode != 0)
        {
            Console.WriteLine($"[ERROR] Frame extraction failed: {stderr}");
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
    var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
    var paths = pathEnv.Split(Path.PathSeparator);

    foreach (var name in names)
    {
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

    // Try where command on Windows
    try
    {
        var cmd = OperatingSystem.IsWindows() ? "where" : "which";
        var psi = new ProcessStartInfo
        {
            FileName = cmd,
            Arguments = names[0],
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        using var process = Process.Start(psi);
        process?.WaitForExit();
        var output = process?.StandardOutput.ReadToEnd()?.Trim();
        if (!string.IsNullOrEmpty(output))
        {
            var firstLine = output.Split('\n')[0].Trim();
            if (File.Exists(firstLine)) return firstLine;
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
  - .NET 10 SDK
  - ffmpeg: https://ffmpeg.org/download.html
");
}
