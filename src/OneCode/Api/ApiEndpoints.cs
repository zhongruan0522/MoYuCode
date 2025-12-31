using System.Diagnostics;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OneCode.Contracts.FileSystem;
using OneCode.Contracts.Jobs;
using OneCode.Contracts.Projects;
using OneCode.Contracts.Providers;
using OneCode.Contracts.Tools;
using OneCode.Data;
using OneCode.Data.Entities;
using OneCode.Services.Jobs;
using OneCode.Services.Shell;

namespace OneCode.Api;

public static class ApiEndpoints
{
    public static void MapOneCodeApis(this WebApplication app)
    {
        var api = app.MapGroup("/api")
            .AddEndpointFilter<ApiResponseEndpointFilter>();

        MapTools(api);
        MapJobs(api);
        MapFileSystem(api);
        MapProviders(api);
        MapProjects(api);
    }

    private static void MapTools(RouteGroupBuilder api)
    {
        var tools = api.MapGroup("/tools");

        tools.MapGet("/codex/status", async (CancellationToken cancellationToken) =>
        {
            var configPath = GetCodexConfigPath();
            return await GetToolStatusAsync(
                toolName: "codex",
                versionArgs: "--version",
                configPath: configPath,
                parseVersion: ParseCodexVersion,
                cancellationToken);
        });

        tools.MapGet("/claude/status", async (CancellationToken cancellationToken) =>
        {
            var configPath = GetClaudeSettingsPath();
            return await GetToolStatusAsync(
                toolName: "claude",
                versionArgs: "--version",
                configPath: configPath,
                parseVersion: ParseClaudeVersion,
                cancellationToken);
        });

        tools.MapPost("/codex/install", (JobManager jobManager, HttpContext httpContext) =>
        {
            var job = jobManager.StartProcessJob(
                kind: "install:codex",
                fileName: "npm",
                arguments: "install -g @openai/codex");
            httpContext.Response.StatusCode = StatusCodes.Status202Accepted;
            return job;
        });

        tools.MapPost("/claude/install", (JobManager jobManager, HttpContext httpContext) =>
        {
            var job = jobManager.StartProcessJob(
                kind: "install:claude",
                fileName: "npm",
                arguments: "install -g @anthropic-ai/claude-code");
            httpContext.Response.StatusCode = StatusCodes.Status202Accepted;
            return job;
        });
    }

    private static void MapJobs(RouteGroupBuilder api)
    {
        var jobs = api.MapGroup("/jobs");

        jobs.MapGet("/{id:guid}", (Guid id, JobManager jobManager) =>
        {
            if (!jobManager.TryGetJob(id, out var job))
            {
                throw new ApiHttpException(StatusCodes.Status404NotFound, "Job not found.");
            }

            return job;
        });
    }

    private static void MapFileSystem(RouteGroupBuilder api)
    {
        var fs = api.MapGroup("/fs");

        fs.MapGet("/drives", () =>
        {
            var drives = DriveInfo.GetDrives()
                .Where(d => d.IsReady)
                .Select(d => new DriveDto(d.Name, d.RootDirectory.FullName, d.DriveType.ToString()))
                .ToList();

            return (IReadOnlyList<DriveDto>)drives;
        });

        fs.MapGet("/list", (string path) =>
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "Missing query parameter: path");
            }

            if (!Directory.Exists(path))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "Directory does not exist.");
            }

            var directoryInfo = new DirectoryInfo(path);

            List<DirectoryEntryDto> directories;
            try
            {
                directories = directoryInfo.EnumerateDirectories()
                    .Where(d => (d.Attributes & FileAttributes.Hidden) == 0)
                    .OrderBy(d => d.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(d => new DirectoryEntryDto(d.Name, d.FullName))
                    .ToList();
            }
            catch (UnauthorizedAccessException)
            {
                throw new ApiHttpException(StatusCodes.Status403Forbidden, "Forbidden.");
            }

            string? parent = null;
            try
            {
                parent = directoryInfo.Parent?.FullName;
            }
            catch
            {
                // ignore
            }

            return new ListDirectoriesResponse(directoryInfo.FullName, parent, directories);
        });

        fs.MapGet("/entries", (string path) =>
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "Missing query parameter: path");
            }

            if (!Directory.Exists(path))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "Directory does not exist.");
            }

            var directoryInfo = new DirectoryInfo(path);

            List<DirectoryEntryDto> directories;
            List<FileEntryDto> files;
            try
            {
                directories = directoryInfo.EnumerateDirectories()
                    .Where(d => (d.Attributes & FileAttributes.Hidden) == 0)
                    .OrderBy(d => d.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(d => new DirectoryEntryDto(d.Name, d.FullName))
                    .ToList();

                files = directoryInfo.EnumerateFiles()
                    .Where(f => (f.Attributes & FileAttributes.Hidden) == 0)
                    .OrderBy(f => f.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(f => new FileEntryDto(f.Name, f.FullName))
                    .ToList();
            }
            catch (UnauthorizedAccessException)
            {
                throw new ApiHttpException(StatusCodes.Status403Forbidden, "Forbidden.");
            }

            string? parent = null;
            try
            {
                parent = directoryInfo.Parent?.FullName;
            }
            catch
            {
                // ignore
            }

            return new ListEntriesResponse(directoryInfo.FullName, parent, directories, files);
        });
    }

    private static void MapProviders(RouteGroupBuilder api)
    {
        var providers = api.MapGroup("/providers");

        providers.MapGet("", async (OneCodeDbContext db, CancellationToken cancellationToken) =>
        {
            var list = await db.Providers
                .OrderBy(x => x.Name)
                .ToListAsync(cancellationToken);

            return (IReadOnlyList<ProviderDto>)list.Select(ToDto).ToList();
        });

        providers.MapGet("/{id:guid}", async (Guid id, OneCodeDbContext db, CancellationToken cancellationToken) =>
        {
            var entity = await db.Providers.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
            if (entity is null)
            {
                throw new ApiHttpException(StatusCodes.Status404NotFound, "Provider not found.");
            }

            return ToDto(entity);
        });

        providers.MapPost("", async ([FromBody] ProviderUpsertRequest request, OneCodeDbContext db, HttpContext httpContext, CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Address))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "Name and Address are required.");
            }

            if (string.IsNullOrWhiteSpace(request.ApiKey))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "ApiKey is required.");
            }

            var entity = new ProviderEntity
            {
                Id = Guid.NewGuid(),
                Name = request.Name.Trim(),
                Address = request.Address.Trim(),
                Logo = string.IsNullOrWhiteSpace(request.Logo) ? null : request.Logo.Trim(),
                ApiKey = request.ApiKey,
                RequestType = request.RequestType,
                AzureApiVersion = string.IsNullOrWhiteSpace(request.AzureApiVersion) ? null : request.AzureApiVersion.Trim(),
                Models = new List<string>(),
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow,
            };

            db.Providers.Add(entity);
            await db.SaveChangesAsync(cancellationToken);

            httpContext.Response.StatusCode = StatusCodes.Status201Created;
            return ToDto(entity);
        });

        providers.MapPut("/{id:guid}", async (Guid id, [FromBody] ProviderUpsertRequest request, OneCodeDbContext db, CancellationToken cancellationToken) =>
        {
            var entity = await db.Providers.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
            if (entity is null)
            {
                throw new ApiHttpException(StatusCodes.Status404NotFound, "Provider not found.");
            }

            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Address))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "Name and Address are required.");
            }

            entity.Name = request.Name.Trim();
            entity.Address = request.Address.Trim();
            entity.Logo = string.IsNullOrWhiteSpace(request.Logo) ? null : request.Logo.Trim();
            entity.RequestType = request.RequestType;
            entity.AzureApiVersion = string.IsNullOrWhiteSpace(request.AzureApiVersion) ? null : request.AzureApiVersion.Trim();
            entity.UpdatedAtUtc = DateTimeOffset.UtcNow;

            if (!string.IsNullOrWhiteSpace(request.ApiKey))
            {
                entity.ApiKey = request.ApiKey;
            }

            await db.SaveChangesAsync(cancellationToken);
            return ToDto(entity);
        });

        providers.MapDelete("/{id:guid}", async (Guid id, OneCodeDbContext db, CancellationToken cancellationToken) =>
        {
            var entity = await db.Providers.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
            if (entity is null)
            {
                throw new ApiHttpException(StatusCodes.Status404NotFound, "Provider not found.");
            }

            db.Providers.Remove(entity);
            await db.SaveChangesAsync(cancellationToken);
            return true;
        });

        providers.MapPost("/{id:guid}/refresh-models", async (Guid id, OneCodeDbContext db, IHttpClientFactory httpClientFactory, CancellationToken cancellationToken) =>
        {
            var entity = await db.Providers.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
            if (entity is null)
            {
                throw new ApiHttpException(StatusCodes.Status404NotFound, "Provider not found.");
            }

            var models = await FetchModelsAsync(httpClientFactory, entity, cancellationToken);
            entity.Models = models.Distinct(StringComparer.Ordinal).OrderBy(x => x, StringComparer.Ordinal).ToList();
            entity.ModelsRefreshedAtUtc = DateTimeOffset.UtcNow;
            entity.UpdatedAtUtc = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(cancellationToken);

            return ToDto(entity);
        });
    }

    private static void MapProjects(RouteGroupBuilder api)
    {
        var projects = api.MapGroup("/projects");

        projects.MapGet("", async (ToolType toolType, OneCodeDbContext db, CancellationToken cancellationToken) =>
        {
            var list = await db.Projects
                .Include(x => x.Provider)
                .Where(x => x.ToolType == toolType)
                .OrderBy(x => x.Name)
                .ToListAsync(cancellationToken);

            return (IReadOnlyList<ProjectDto>)list.Select(ToDto).ToList();
        });

        projects.MapGet("/{id:guid}", async (Guid id, OneCodeDbContext db, CancellationToken cancellationToken) =>
        {
            var project = await db.Projects
                .Include(x => x.Provider)
                .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

            if (project is null)
            {
                throw new ApiHttpException(StatusCodes.Status404NotFound, "Project not found.");
            }

            return ToDto(project);
        });

        projects.MapPost("", async (
            [FromBody] ProjectUpsertRequest request,
            OneCodeDbContext db,
            HttpContext httpContext,
            CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "Name is required.");
            }

            if (string.IsNullOrWhiteSpace(request.WorkspacePath))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "WorkspacePath is required.");
            }

            if (!Directory.Exists(request.WorkspacePath))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "WorkspacePath does not exist.");
            }

            if (request.ProviderId.HasValue)
            {
                var providerExists = await db.Providers.AnyAsync(x => x.Id == request.ProviderId, cancellationToken);
                if (!providerExists)
                {
                    throw new ApiHttpException(StatusCodes.Status400BadRequest, "ProviderId does not exist.");
                }
            }

            var entity = new ProjectEntity
            {
                Id = Guid.NewGuid(),
                ToolType = request.ToolType,
                Name = request.Name.Trim(),
                WorkspacePath = request.WorkspacePath.Trim(),
                ProviderId = request.ProviderId,
                Model = string.IsNullOrWhiteSpace(request.Model) ? null : request.Model.Trim(),
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow,
            };

            db.Projects.Add(entity);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                throw new ApiHttpException(StatusCodes.Status409Conflict, "Project name already exists for this tool type.");
            }

            await db.Entry(entity).Reference(x => x.Provider).LoadAsync(cancellationToken);
            httpContext.Response.StatusCode = StatusCodes.Status201Created;
            return ToDto(entity);
        });

        projects.MapPut("/{id:guid}", async (
            Guid id,
            [FromBody] ProjectUpsertRequest request,
            OneCodeDbContext db,
            CancellationToken cancellationToken) =>
        {
            var entity = await db.Projects.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
            if (entity is null)
            {
                throw new ApiHttpException(StatusCodes.Status404NotFound, "Project not found.");
            }

            if (string.IsNullOrWhiteSpace(request.Name))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "Name is required.");
            }

            if (string.IsNullOrWhiteSpace(request.WorkspacePath))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "WorkspacePath is required.");
            }

            if (!Directory.Exists(request.WorkspacePath))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "WorkspacePath does not exist.");
            }

            if (request.ProviderId.HasValue)
            {
                var providerExists = await db.Providers.AnyAsync(x => x.Id == request.ProviderId, cancellationToken);
                if (!providerExists)
                {
                    throw new ApiHttpException(StatusCodes.Status400BadRequest, "ProviderId does not exist.");
                }
            }

            entity.ToolType = request.ToolType;
            entity.Name = request.Name.Trim();
            entity.WorkspacePath = request.WorkspacePath.Trim();
            entity.ProviderId = request.ProviderId;
            entity.Model = string.IsNullOrWhiteSpace(request.Model) ? null : request.Model.Trim();
            entity.UpdatedAtUtc = DateTimeOffset.UtcNow;

            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                throw new ApiHttpException(StatusCodes.Status409Conflict, "Project name already exists for this tool type.");
            }

            await db.Entry(entity).Reference(x => x.Provider).LoadAsync(cancellationToken);
            return ToDto(entity);
        });

        projects.MapDelete("/{id:guid}", async (Guid id, OneCodeDbContext db, CancellationToken cancellationToken) =>
        {
            var entity = await db.Projects.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
            if (entity is null)
            {
                throw new ApiHttpException(StatusCodes.Status404NotFound, "Project not found.");
            }

            db.Projects.Remove(entity);
            await db.SaveChangesAsync(cancellationToken);
            return true;
        });

        projects.MapPost("/{id:guid}/start", async (
            Guid id,
            OneCodeDbContext db,
            PowerShellLauncher powerShellLauncher,
            CancellationToken cancellationToken) =>
        {
            var project = await db.Projects
                .Include(x => x.Provider)
                .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

            if (project is null)
            {
                throw new ApiHttpException(StatusCodes.Status404NotFound, "Project not found.");
            }

            if (!Directory.Exists(project.WorkspacePath))
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "WorkspacePath does not exist.");
            }

            (string Command, IReadOnlyDictionary<string, string>? Env) launch;
            try
            {
                launch = project.ToolType switch
                {
                    ToolType.Codex => BuildCodexLaunch(project),
                    ToolType.ClaudeCode => BuildClaudeLaunch(project),
                    _ => throw new ArgumentOutOfRangeException(),
                };
            }
            catch (InvalidOperationException ex)
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, ex.Message);
            }

            powerShellLauncher.LaunchNewWindow(
                workingDirectory: project.WorkspacePath,
                windowTitle: $"OneCode - {project.ToolType} - {project.Name}",
                command: launch.Command,
                environment: launch.Env);

            project.LastStartedAtUtc = DateTimeOffset.UtcNow;
            project.UpdatedAtUtc = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            return true;
        });

        projects.MapGet("/{id:guid}/sessions", async (
            Guid id,
            OneCodeDbContext db,
            CancellationToken cancellationToken) =>
        {
            var project = await db.Projects.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
            if (project is null)
            {
                throw new ApiHttpException(StatusCodes.Status404NotFound, "Project not found.");
            }

            if (project.ToolType != ToolType.Codex)
            {
                throw new ApiHttpException(StatusCodes.Status400BadRequest, "Only Codex sessions are supported.");
            }

            var sessionsRoot = Path.Combine(GetCodexHomePath(), "sessions");
            if (!Directory.Exists(sessionsRoot))
            {
                return Array.Empty<ProjectSessionDto>();
            }

            var results = new List<ProjectSessionDto>();
            foreach (var filePath in Directory.EnumerateFiles(sessionsRoot, "*.jsonl", SearchOption.AllDirectories))
            {
                cancellationToken.ThrowIfCancellationRequested();

                var meta = await TryReadCodexSessionMetaAsync(filePath, cancellationToken);
                if (meta is null)
                {
                    continue;
                }

                if (!IsSameOrDescendantPath(project.WorkspacePath, meta.Cwd))
                {
                    continue;
                }

                var session = await TryBuildCodexSessionSummaryAsync(filePath, meta, cancellationToken);
                if (session is not null)
                {
                    results.Add(session);
                }
            }

            return results
                .OrderByDescending(x => x.CreatedAtUtc)
                .ToArray();
        });

        projects.MapGet("/scan-codex-sessions", async (
            ToolType toolType,
            OneCodeDbContext db,
            HttpContext httpContext,
            CancellationToken cancellationToken) =>
        {
            var response = httpContext.Response;
            response.Headers.CacheControl = "no-cache";
            response.Headers.Connection = "keep-alive";
            response.Headers.Append("X-Accel-Buffering", "no");
            response.ContentType = "text/event-stream";

            await using var writer = new StreamWriter(response.Body, Encoding.UTF8, leaveOpen: true);
            var connected = true;

            async Task<bool> TrySendAsync(string eventName, string data)
            {
                if (!connected)
                {
                    return false;
                }

                try
                {
                    if (!string.IsNullOrWhiteSpace(eventName))
                    {
                        await writer.WriteAsync($"event: {eventName}\n");
                    }

                    var normalized = (data ?? string.Empty)
                        .Replace("\r\n", "\n", StringComparison.Ordinal)
                        .Replace('\r', '\n');

                    foreach (var line in normalized.Split('\n'))
                    {
                        await writer.WriteAsync($"data: {line}\n");
                    }

                    await writer.WriteAsync("\n");
                    await writer.FlushAsync(cancellationToken);
                    return true;
                }
                catch (OperationCanceledException)
                {
                    connected = false;
                    return false;
                }
                catch (IOException)
                {
                    connected = false;
                    return false;
                }
            }

            Task<bool> LogAsync(string message)
                => TrySendAsync("log", $"[{DateTimeOffset.Now:HH:mm:ss}] {message}");

            async Task SendDoneAsync(object payload)
            {
                await TrySendAsync("done", JsonSerializer.Serialize(payload));
            }

            if (toolType != ToolType.Codex)
            {
                await LogAsync("当前仅支持从 Codex sessions 扫描项目。");
                await SendDoneAsync(new
                {
                    scannedFiles = 0,
                    uniqueCwds = 0,
                    created = 0,
                    skippedExisting = 0,
                    skippedMissingWorkspace = 0,
                    readErrors = 0,
                    jsonErrors = 0,
                });
                return Results.Empty;
            }

            var sessionsRoot = Path.Combine(GetCodexHomePath(), "sessions");
            if (!await LogAsync($"开始扫描：{sessionsRoot}"))
            {
                return Results.Empty;
            }

            if (!Directory.Exists(sessionsRoot))
            {
                await LogAsync("sessions 目录不存在，未执行扫描。");
                await SendDoneAsync(new
                {
                    scannedFiles = 0,
                    uniqueCwds = 0,
                    created = 0,
                    skippedExisting = 0,
                    skippedMissingWorkspace = 0,
                    readErrors = 0,
                    jsonErrors = 0,
                });
                return Results.Empty;
            }

            string[] jsonlFiles;
            try
            {
                jsonlFiles = Directory.EnumerateFiles(sessionsRoot, "*.jsonl", SearchOption.AllDirectories).ToArray();
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                await LogAsync($"读取 sessions 目录失败：{ex.Message}");
                await SendDoneAsync(new
                {
                    scannedFiles = 0,
                    uniqueCwds = 0,
                    created = 0,
                    skippedExisting = 0,
                    skippedMissingWorkspace = 0,
                    readErrors = 0,
                    jsonErrors = 0,
                });
                return Results.Empty;
            }

            await LogAsync($"发现 .jsonl 文件：{jsonlFiles.Length}");

            var uniqueCwds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var readErrors = 0;
            var jsonErrors = 0;

            for (var i = 0; i < jsonlFiles.Length; i++)
            {
                if (!connected || cancellationToken.IsCancellationRequested)
                {
                    return Results.Empty;
                }

                var file = jsonlFiles[i];
                string? firstLine;
                try
                {
                    await using var stream = File.OpenRead(file);
                    using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
                    firstLine = await reader.ReadLineAsync(cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    return Results.Empty;
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    readErrors++;
                    if (readErrors <= 10)
                    {
                        await LogAsync($"读取失败：{file}（{ex.Message}）");
                    }

                    continue;
                }

                if (string.IsNullOrWhiteSpace(firstLine))
                {
                    continue;
                }

                firstLine = firstLine.Trim().TrimStart('\uFEFF');

                string? cwd = null;
                try
                {
                    using var doc = JsonDocument.Parse(firstLine);
                    if (doc.RootElement.TryGetProperty("payload", out var payload)
                        && payload.ValueKind == JsonValueKind.Object
                        && payload.TryGetProperty("cwd", out var cwdProp)
                        && cwdProp.ValueKind == JsonValueKind.String)
                    {
                        cwd = cwdProp.GetString();
                    }
                }
                catch (JsonException)
                {
                    jsonErrors++;
                    if (jsonErrors <= 10)
                    {
                        await LogAsync($"JSON 解析失败：{file}");
                    }

                    continue;
                }

                if (string.IsNullOrWhiteSpace(cwd))
                {
                    continue;
                }

                var trimmed = cwd.Trim();
                if (trimmed.Length == 0)
                {
                    continue;
                }

                if (uniqueCwds.Add(trimmed) && uniqueCwds.Count <= 30)
                {
                    await LogAsync($"发现项目 cwd：{trimmed}");
                }

                if ((i + 1) % 1000 == 0)
                {
                    await LogAsync($"扫描进度：{i + 1}/{jsonlFiles.Length}，已发现 cwd：{uniqueCwds.Count}");
                }
            }

            if (uniqueCwds.Count > 30)
            {
                await LogAsync($"发现 cwd 数：{uniqueCwds.Count}（后续仅展示创建/跳过日志）");
            }

            var existingProjects = await db.Projects
                .Where(x => x.ToolType == toolType)
                .Select(x => new { x.Name, x.WorkspacePath })
                .ToListAsync(cancellationToken);

            var existingNameSet = new HashSet<string>(
                existingProjects.Select(x => x.Name),
                StringComparer.OrdinalIgnoreCase);
            var existingWorkspaceSet = new HashSet<string>(
                existingProjects.Select(x => x.WorkspacePath),
                StringComparer.OrdinalIgnoreCase);

            var workspaceToName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var project in existingProjects)
            {
                if (!workspaceToName.ContainsKey(project.WorkspacePath))
                {
                    workspaceToName[project.WorkspacePath] = project.Name;
                }
            }

            var created = 0;
            var skippedExisting = 0;
            var skippedMissingWorkspace = 0;
            var loggedExistingSkips = 0;
            var loggedMissingSkips = 0;
            var loggedTruncations = 0;

            await LogAsync("开始创建项目…");

            foreach (var cwd in uniqueCwds.OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
            {
                if (!connected || cancellationToken.IsCancellationRequested)
                {
                    return Results.Empty;
                }

                var workspacePath = cwd.Trim();
                if (!Directory.Exists(workspacePath))
                {
                    skippedMissingWorkspace++;
                    if (loggedMissingSkips < 20)
                    {
                        loggedMissingSkips++;
                        await LogAsync($"目录不存在，跳过：{workspacePath}");
                    }

                    continue;
                }

                if (existingWorkspaceSet.Contains(workspacePath))
                {
                    skippedExisting++;
                    if (loggedExistingSkips < 20)
                    {
                        loggedExistingSkips++;
                        if (workspaceToName.TryGetValue(workspacePath, out var existingName))
                        {
                            await LogAsync($"工作空间已存在，跳过：{workspacePath}（{existingName}）");
                        }
                        else
                        {
                            await LogAsync($"工作空间已存在，跳过：{workspacePath}");
                        }
                    }

                    continue;
                }

                var name = BuildProjectNameFromCwd(workspacePath);
                if (!string.Equals(name, workspacePath, StringComparison.Ordinal) && loggedTruncations < 5)
                {
                    loggedTruncations++;
                    await LogAsync($"cwd 过长，项目名已截断：{name}");
                }

                if (existingNameSet.Contains(name))
                {
                    skippedExisting++;
                    if (loggedExistingSkips < 20)
                    {
                        loggedExistingSkips++;
                        await LogAsync($"已存在，跳过：{name}");
                    }

                    continue;
                }

                var entity = new ProjectEntity
                {
                    Id = Guid.NewGuid(),
                    ToolType = toolType,
                    Name = name,
                    WorkspacePath = workspacePath,
                    ProviderId = null,
                    Model = null,
                    CreatedAtUtc = DateTimeOffset.UtcNow,
                    UpdatedAtUtc = DateTimeOffset.UtcNow,
                };

                db.Projects.Add(entity);
                try
                {
                    await db.SaveChangesAsync(cancellationToken);
                    created++;
                    existingNameSet.Add(name);
                    existingWorkspaceSet.Add(workspacePath);
                    workspaceToName[workspacePath] = name;
                    await LogAsync($"已创建：{name}");
                }
                catch (OperationCanceledException)
                {
                    return Results.Empty;
                }
                catch (DbUpdateException)
                {
                    db.Entry(entity).State = EntityState.Detached;
                    skippedExisting++;
                    if (loggedExistingSkips < 20)
                    {
                        loggedExistingSkips++;
                        await LogAsync($"创建冲突，跳过：{name}");
                    }
                }
            }

            await LogAsync($"完成：创建 {created}，跳过已存在 {skippedExisting}，跳过不存在目录 {skippedMissingWorkspace}。");
            await SendDoneAsync(new
            {
                scannedFiles = jsonlFiles.Length,
                uniqueCwds = uniqueCwds.Count,
                created,
                skippedExisting,
                skippedMissingWorkspace,
                readErrors,
                jsonErrors,
            });

            return Results.Empty;
        });
    }

    // Shared helpers implemented below

    private sealed record CodexSessionMeta(
        string Id,
        string Cwd,
        DateTimeOffset CreatedAtUtc);

    private enum CodexSessionEventKind
    {
        Message = 0,
        FunctionCall = 1,
        AgentReasoning = 2,
        TokenCount = 3,
        Other = 4,
    }

    private static async Task<CodexSessionMeta?> TryReadCodexSessionMetaAsync(
        string filePath,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var stream = File.OpenRead(filePath);
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 4096);

            var line = await reader.ReadLineAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(line))
            {
                return null;
            }

            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;

            if (!TryReadTimestamp(root, out var createdAtUtc))
            {
                createdAtUtc = new DateTimeOffset(File.GetCreationTimeUtc(filePath), TimeSpan.Zero);
            }

            if (!root.TryGetProperty("payload", out var payload) || payload.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var id = payload.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.String
                ? idProp.GetString()
                : null;

            var cwd = payload.TryGetProperty("cwd", out var cwdProp) && cwdProp.ValueKind == JsonValueKind.String
                ? cwdProp.GetString()
                : null;

            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(cwd))
            {
                return null;
            }

            return new CodexSessionMeta(id!, cwd!, createdAtUtc);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            return null;
        }
    }

    private static async Task<ProjectSessionDto?> TryBuildCodexSessionSummaryAsync(
        string filePath,
        CodexSessionMeta meta,
        CancellationToken cancellationToken)
    {
        try
        {
            var startAt = meta.CreatedAtUtc;
            var lastEventAt = startAt;

            var messageCount = 0;
            var functionCallCount = 0;
            var reasoningCount = 0;
            var tokenCount = 0;
            var otherCount = 0;

            var inputTokens = 0L;
            var cachedInputTokens = 0L;
            var outputTokens = 0L;
            var reasoningOutputTokens = 0L;

            var events = new List<(DateTimeOffset Timestamp, CodexSessionEventKind Kind)>();

            await using var stream = File.OpenRead(filePath);
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);

            while (true)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var line = await reader.ReadLineAsync(cancellationToken);
                if (line is null)
                {
                    break;
                }

                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                using var doc = JsonDocument.Parse(line);
                var root = doc.RootElement;

                if (!TryReadTimestamp(root, out var timestamp))
                {
                    continue;
                }

                if (timestamp > lastEventAt)
                {
                    lastEventAt = timestamp;
                }

                var kind = GetCodexSessionEventKind(root);
                if (kind == CodexSessionEventKind.TokenCount)
                {
                    TryAccumulateCodexTokenUsage(
                        root,
                        ref inputTokens,
                        ref cachedInputTokens,
                        ref outputTokens,
                        ref reasoningOutputTokens);
                }

                events.Add((timestamp, kind));
                switch (kind)
                {
                    case CodexSessionEventKind.Message:
                        messageCount++;
                        break;
                    case CodexSessionEventKind.FunctionCall:
                        functionCallCount++;
                        break;
                    case CodexSessionEventKind.AgentReasoning:
                        reasoningCount++;
                        break;
                    case CodexSessionEventKind.TokenCount:
                        tokenCount++;
                        break;
                    case CodexSessionEventKind.Other:
                        otherCount++;
                        break;
                }
            }

            var duration = lastEventAt - startAt;
            var durationMs = duration <= TimeSpan.Zero ? 0 : (long)duration.TotalMilliseconds;

            var timeline = BuildTimeline(events, startAt, lastEventAt);
            return new ProjectSessionDto(
                Id: meta.Id,
                CreatedAtUtc: startAt,
                LastEventAtUtc: lastEventAt,
                DurationMs: durationMs,
                EventCounts: new SessionEventCountsDto(messageCount, functionCallCount, reasoningCount, tokenCount, otherCount),
                TokenUsage: new SessionTokenUsageDto(inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens),
                Timeline: timeline);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            return null;
        }
    }

    private static IReadOnlyList<SessionTimelineBucketDto> BuildTimeline(
        IReadOnlyList<(DateTimeOffset Timestamp, CodexSessionEventKind Kind)> events,
        DateTimeOffset startAt,
        DateTimeOffset lastEventAt)
    {
        if (events.Count == 0)
        {
            return Array.Empty<SessionTimelineBucketDto>();
        }

        var duration = lastEventAt - startAt;
        if (duration <= TimeSpan.Zero)
        {
            var message = 0;
            var functionCall = 0;
            var reasoning = 0;
            var tokenCount = 0;
            var other = 0;
            foreach (var (_, kind) in events)
            {
                switch (kind)
                {
                    case CodexSessionEventKind.Message:
                        message++;
                        break;
                    case CodexSessionEventKind.FunctionCall:
                        functionCall++;
                        break;
                    case CodexSessionEventKind.AgentReasoning:
                        reasoning++;
                        break;
                    case CodexSessionEventKind.TokenCount:
                        tokenCount++;
                        break;
                    case CodexSessionEventKind.Other:
                        other++;
                        break;
                }
            }

            return [new SessionTimelineBucketDto(message, functionCall, reasoning, tokenCount, other)];
        }

        var bucketCount = (int)Math.Ceiling(duration.TotalSeconds / 15);
        bucketCount = Math.Clamp(bucketCount, 12, 96);

        var messageCounts = new int[bucketCount];
        var functionCallCounts = new int[bucketCount];
        var reasoningCounts = new int[bucketCount];
        var tokenCountCounts = new int[bucketCount];
        var otherCounts = new int[bucketCount];

        var totalMs = duration.TotalMilliseconds;
        foreach (var (timestamp, kind) in events)
        {
            var offsetMs = (timestamp - startAt).TotalMilliseconds;
            var ratio = offsetMs <= 0 ? 0 : offsetMs / totalMs;
            var idx = (int)Math.Floor(ratio * bucketCount);
            idx = Math.Clamp(idx, 0, bucketCount - 1);

            switch (kind)
            {
                case CodexSessionEventKind.Message:
                    messageCounts[idx]++;
                    break;
                case CodexSessionEventKind.FunctionCall:
                    functionCallCounts[idx]++;
                    break;
                case CodexSessionEventKind.AgentReasoning:
                    reasoningCounts[idx]++;
                    break;
                case CodexSessionEventKind.TokenCount:
                    tokenCountCounts[idx]++;
                    break;
                case CodexSessionEventKind.Other:
                    otherCounts[idx]++;
                    break;
            }
        }

        var buckets = new SessionTimelineBucketDto[bucketCount];
        for (var i = 0; i < bucketCount; i++)
        {
            buckets[i] = new SessionTimelineBucketDto(
                messageCounts[i],
                functionCallCounts[i],
                reasoningCounts[i],
                tokenCountCounts[i],
                otherCounts[i]);
        }

        return buckets;
    }

    private static bool TryReadTimestamp(JsonElement root, out DateTimeOffset timestamp)
    {
        timestamp = default;

        if (root.TryGetProperty("timestamp", out var tsProp) && tsProp.ValueKind == JsonValueKind.String)
        {
            var raw = tsProp.GetString();
            if (TryParseUtcTimestamp(raw, out timestamp))
            {
                return true;
            }
        }

        if (root.TryGetProperty("payload", out var payload) &&
            payload.ValueKind == JsonValueKind.Object &&
            payload.TryGetProperty("timestamp", out var payloadTs) &&
            payloadTs.ValueKind == JsonValueKind.String)
        {
            var raw = payloadTs.GetString();
            if (TryParseUtcTimestamp(raw, out timestamp))
            {
                return true;
            }
        }

        return false;
    }

    private static bool TryParseUtcTimestamp(string? raw, out DateTimeOffset timestamp)
    {
        timestamp = default;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        return DateTimeOffset.TryParse(
            raw,
            System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
            out timestamp);
    }

    private static CodexSessionEventKind GetCodexSessionEventKind(JsonElement root)
    {
        if (root.TryGetProperty("payload", out var payload) &&
            payload.ValueKind == JsonValueKind.Object &&
            payload.TryGetProperty("type", out var payloadType) &&
            payloadType.ValueKind == JsonValueKind.String)
        {
            var value = payloadType.GetString();
            if (string.IsNullOrWhiteSpace(value))
            {
                return CodexSessionEventKind.Other;
            }

            return value switch
            {
                "message" or "user_message" => CodexSessionEventKind.Message,
                "function_call" or "function_call_output" => CodexSessionEventKind.FunctionCall,
                "agent_reasoning" or "reasoning" => CodexSessionEventKind.AgentReasoning,
                "token_count" => CodexSessionEventKind.TokenCount,
                _ => CodexSessionEventKind.Other,
            };
        }

        return CodexSessionEventKind.Other;
    }

    private static bool TryAccumulateCodexTokenUsage(
        JsonElement root,
        ref long inputTokens,
        ref long cachedInputTokens,
        ref long outputTokens,
        ref long reasoningOutputTokens)
    {
        if (!root.TryGetProperty("payload", out var payload) || payload.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        if (!payload.TryGetProperty("type", out var payloadType) || payloadType.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        if (!string.Equals(payloadType.GetString(), "token_count", StringComparison.Ordinal))
        {
            return false;
        }

        if (!payload.TryGetProperty("info", out var info) || info.ValueKind != JsonValueKind.Object)
        {
            return true;
        }

        if (!info.TryGetProperty("last_token_usage", out var lastUsage) || lastUsage.ValueKind != JsonValueKind.Object)
        {
            return true;
        }

        if (lastUsage.TryGetProperty("input_tokens", out var inputProp) && inputProp.TryGetInt64(out var input))
        {
            inputTokens += input;
        }

        if (lastUsage.TryGetProperty("cached_input_tokens", out var cachedProp) && cachedProp.TryGetInt64(out var cached))
        {
            cachedInputTokens += cached;
        }

        if (lastUsage.TryGetProperty("output_tokens", out var outProp) && outProp.TryGetInt64(out var output))
        {
            outputTokens += output;
        }

        if (lastUsage.TryGetProperty("reasoning_output_tokens", out var reasoningProp) && reasoningProp.TryGetInt64(out var reasoning))
        {
            reasoningOutputTokens += reasoning;
        }

        return true;
    }

    private static bool IsSameOrDescendantPath(string rootPath, string path)
    {
        if (string.IsNullOrWhiteSpace(rootPath) || string.IsNullOrWhiteSpace(path))
        {
            return false;
        }

        string rootFull;
        string candidateFull;
        try
        {
            rootFull = Path.GetFullPath(rootPath.Trim());
            candidateFull = Path.GetFullPath(path.Trim());
        }
        catch
        {
            return false;
        }

        if (candidateFull.Equals(rootFull, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var rootWithSep = rootFull.EndsWith(Path.DirectorySeparatorChar)
            ? rootFull
            : rootFull + Path.DirectorySeparatorChar;

        return candidateFull.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase);
    }

    private static string GetCodexHomePath()
    {
        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var codexHome = Environment.GetEnvironmentVariable("CODEX_HOME");
        return string.IsNullOrWhiteSpace(codexHome)
            ? Path.Combine(userProfile, ".codex")
            : codexHome;
    }

    private const int ProjectNameMaxLength = 200;

    private static string BuildProjectNameFromCwd(string cwd)
    {
        var trimmed = cwd.Trim();
        if (trimmed.Length <= ProjectNameMaxLength)
        {
            return trimmed;
        }

        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(trimmed)));
        var suffix = "-" + hash[..8];
        var prefixLength = ProjectNameMaxLength - suffix.Length;
        if (prefixLength <= 0)
        {
            return hash[..ProjectNameMaxLength];
        }

        return trimmed[..prefixLength] + suffix;
    }

    private static string GetCodexConfigPath()
    {
        return Path.Combine(GetCodexHomePath(), "config.toml");
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
        var configExists = File.Exists(configPath);

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

        string? exePath = null;
        if (Directory.Exists(npmBin))
        {
            var shim = Path.Combine(npmBin, $"{toolName}.cmd");
            if (File.Exists(shim))
            {
                exePath = shim;
            }
        }

        string? versionOutput = null;

        if (!string.IsNullOrWhiteSpace(exePath))
        {
            versionOutput = await TryRunAndReadFirstLineAsync(
                fileName: "cmd.exe",
                argumentList: ["/c", exePath, versionArgs],
                timeoutMs: 15000,
                cancellationToken,
                environment);
        }

        if (string.IsNullOrWhiteSpace(versionOutput))
        {
            versionOutput = await TryRunAndReadFirstLineAsync(
                fileName: "cmd.exe",
                argumentList: ["/c", toolName, versionArgs],
                timeoutMs: 15000,
                cancellationToken,
                environment);
        }

        var version = versionOutput is null ? null : parseVersion(versionOutput);
        var installed = version is not null;

        return new ToolStatusDto(
            Installed: installed,
            Version: version,
            ExecutablePath: exePath,
            ConfigPath: configPath,
            ConfigExists: configExists);
    }

    private static string? ParseCodexVersion(string versionLine)
    {
        var tokens = versionLine.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length >= 2 && TryParseVersionToken(tokens[1], out var parsed))
        {
            return parsed;
        }

        if (tokens.Length >= 1 && TryParseVersionToken(tokens[0], out parsed))
        {
            return parsed;
        }

        return null;
    }

    private static string? ParseClaudeVersion(string versionLine)
    {
        var tokens = versionLine.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return tokens.Length >= 1 && TryParseVersionToken(tokens[0], out var parsed) ? parsed : null;
    }

    private static bool TryParseVersionToken(string token, out string parsed)
    {
        var trimmed = token.Trim().TrimStart('v', 'V');
        if (Version.TryParse(trimmed, out _))
        {
            parsed = trimmed;
            return true;
        }

        parsed = string.Empty;
        return false;
    }

    private static async Task<string?> TryRunAndReadFirstLineAsync(
        string fileName,
        IReadOnlyList<string> argumentList,
        int timeoutMs,
        CancellationToken cancellationToken,
        IReadOnlyDictionary<string, string>? environment = null)
    {
        var output = await TryRunAndReadOutputAsync(
            fileName,
            argumentList,
            timeoutMs,
            cancellationToken,
            environment);

        if (string.IsNullOrWhiteSpace(output))
        {
            return null;
        }

        foreach (var line in output.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (!string.IsNullOrWhiteSpace(line))
            {
                return line.Trim();
            }
        }

        return null;
    }

    private static async Task<string?> TryRunAndReadOutputAsync(
        string fileName,
        IReadOnlyList<string> argumentList,
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
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };

            foreach (var argument in argumentList)
            {
                process.StartInfo.ArgumentList.Add(argument);
            }

            if (environment is not null)
            {
                foreach (var (key, value) in environment)
                {
                    process.StartInfo.Environment[key] = value;
                }
            }

            process.Start();

            var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
            var exitTask = process.WaitForExitAsync(cancellationToken);

            var completed = await Task.WhenAny(exitTask, Task.Delay(timeoutMs, cancellationToken));
            if (completed != exitTask)
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

            if (process.ExitCode != 0)
            {
                return null;
            }

            var stdout = await stdoutTask;
            if (!string.IsNullOrWhiteSpace(stdout))
            {
                return stdout.Trim();
            }

            var stderr = await stderrTask;
            return string.IsNullOrWhiteSpace(stderr) ? null : stderr.Trim();
        }
        catch
        {
            return null;
        }
    }

    private static async Task<IReadOnlyList<string>> FetchModelsAsync(
        IHttpClientFactory httpClientFactory,
        ProviderEntity provider,
        CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient();

        try
        {
            return provider.RequestType switch
            {
                ProviderRequestType.OpenAI => await FetchOpenAiModelsAsync(client, provider, cancellationToken),
                ProviderRequestType.OpenAIResponses => await FetchOpenAiModelsAsync(client, provider, cancellationToken),
                ProviderRequestType.AzureOpenAI => await FetchAzureDeploymentsAsync(client, provider, cancellationToken),
                ProviderRequestType.Anthropic => await FetchAnthropicModelsAsync(client, provider, cancellationToken),
                _ => Array.Empty<string>(),
            };
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            throw new ApiHttpException(StatusCodes.Status502BadGateway, "Failed to fetch models.");
        }
    }

    private static async Task<IReadOnlyList<string>> FetchOpenAiModelsAsync(
        HttpClient client,
        ProviderEntity provider,
        CancellationToken cancellationToken)
    {
        var modelsUrl = CombineUrl(provider.Address, "/v1/models");

        using var request = new HttpRequestMessage(HttpMethod.Get, modelsUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", provider.ApiKey);

        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        var results = new List<string>();
        foreach (var item in data.EnumerateArray())
        {
            if (item.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.String)
            {
                var value = idProp.GetString();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    results.Add(value);
                }
            }
        }

        return results;
    }

    private static async Task<IReadOnlyList<string>> FetchAnthropicModelsAsync(
        HttpClient client,
        ProviderEntity provider,
        CancellationToken cancellationToken)
    {
        var modelsUrl = CombineUrl(provider.Address, "/v1/models");

        using var request = new HttpRequestMessage(HttpMethod.Get, modelsUrl);
        request.Headers.Add("x-api-key", provider.ApiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");

        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        var results = new List<string>();
        foreach (var item in data.EnumerateArray())
        {
            if (item.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.String)
            {
                var value = idProp.GetString();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    results.Add(value);
                }
            }
        }

        return results;
    }

    private static async Task<IReadOnlyList<string>> FetchAzureDeploymentsAsync(
        HttpClient client,
        ProviderEntity provider,
        CancellationToken cancellationToken)
    {
        var apiVersion = string.IsNullOrWhiteSpace(provider.AzureApiVersion)
            ? "2025-04-01-preview"
            : provider.AzureApiVersion;

        var baseUrl = provider.Address.TrimEnd('/');
        var deploymentsUrl = $"{baseUrl}/openai/deployments?api-version={Uri.EscapeDataString(apiVersion)}";

        using var request = new HttpRequestMessage(HttpMethod.Get, deploymentsUrl);
        request.Headers.Add("api-key", provider.ApiKey);

        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        var results = new List<string>();
        foreach (var item in data.EnumerateArray())
        {
            if (item.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.String)
            {
                var value = idProp.GetString();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    results.Add(value);
                }
            }
        }

        return results;
    }

    private static string CombineUrl(string baseUrl, string path)
    {
        var trimmedBase = baseUrl.TrimEnd('/');
        if (trimmedBase.EndsWith("/v1", StringComparison.OrdinalIgnoreCase) && path.StartsWith("/v1/", StringComparison.Ordinal))
        {
            return trimmedBase + path[3..];
        }

        return trimmedBase + path;
    }

    private static ProviderDto ToDto(ProviderEntity entity)
    {
        var hasKey = !string.IsNullOrWhiteSpace(entity.ApiKey);
        string? last4 = null;
        if (hasKey)
        {
            var trimmed = entity.ApiKey.Trim();
            last4 = trimmed.Length >= 4 ? trimmed[^4..] : trimmed;
        }

        return new ProviderDto(
            Id: entity.Id,
            Name: entity.Name,
            Address: entity.Address,
            Logo: entity.Logo,
            RequestType: entity.RequestType,
            AzureApiVersion: entity.AzureApiVersion,
            HasApiKey: hasKey,
            ApiKeyLast4: last4,
            Models: entity.Models,
            ModelsRefreshedAtUtc: entity.ModelsRefreshedAtUtc);
    }

    private static ProjectDto ToDto(ProjectEntity entity)
    {
        return new ProjectDto(
            Id: entity.Id,
            ToolType: entity.ToolType,
            Name: entity.Name,
            WorkspacePath: entity.WorkspacePath,
            ProviderId: entity.ProviderId,
            ProviderName: entity.Provider?.Name,
            Model: entity.Model,
            LastStartedAtUtc: entity.LastStartedAtUtc,
            CreatedAtUtc: entity.CreatedAtUtc,
            UpdatedAtUtc: entity.UpdatedAtUtc);
    }

    private static (string Command, IReadOnlyDictionary<string, string>? Env) BuildCodexLaunch(ProjectEntity project)
    {
        if (project.Provider is not null && project.Provider.RequestType == ProviderRequestType.Anthropic)
        {
            throw new InvalidOperationException("Codex projects do not support Anthropic providers.");
        }

        const string providerId = "onecode";
        const string envKeyName = "ONECODE_API_KEY";

        var args = new List<string>
        {
            "codex",
            "--cd",
            PsQuote(project.WorkspacePath),
        };

        if (!string.IsNullOrWhiteSpace(project.Model))
        {
            args.Add("-m");
            args.Add(PsQuote(project.Model!));

            args.Add("-c");
            args.Add(PsQuote($"model=\"{EscapeTomlString(project.Model!)}\""));
        }

        Dictionary<string, string>? env = null;
        if (project.Provider is not null)
        {
            env = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [envKeyName] = project.Provider.ApiKey,
            };

            args.Add("-c");
            args.Add(PsQuote($"model_provider=\"{providerId}\""));

            args.Add("-c");
            args.Add(PsQuote($"model_providers.{providerId}.name=\"OneCode\""));

            args.Add("-c");
            args.Add(PsQuote($"model_providers.{providerId}.base_url=\"{EscapeTomlString(project.Provider.Address)}\""));

            switch (project.Provider.RequestType)
            {
                case ProviderRequestType.OpenAI:
                    args.Add("-c");
                    args.Add(PsQuote($"model_providers.{providerId}.wire_api=\"chat\""));
                    args.Add("-c");
                    args.Add(PsQuote($"model_providers.{providerId}.env_key=\"{envKeyName}\""));
                    break;

                case ProviderRequestType.OpenAIResponses:
                    args.Add("-c");
                    args.Add(PsQuote($"model_providers.{providerId}.wire_api=\"responses\""));
                    args.Add("-c");
                    args.Add(PsQuote($"model_providers.{providerId}.env_key=\"{envKeyName}\""));
                    break;

                case ProviderRequestType.AzureOpenAI:
                {
                    var apiVersion = string.IsNullOrWhiteSpace(project.Provider.AzureApiVersion)
                        ? "2025-04-01-preview"
                        : project.Provider.AzureApiVersion;

                    args.Add("-c");
                    args.Add(PsQuote($"model_providers.{providerId}.wire_api=\"responses\""));

                    args.Add("-c");
                    args.Add(PsQuote($"model_providers.{providerId}.env_http_headers={{ \"api-key\" = \"{envKeyName}\" }}"));

                    args.Add("-c");
                    args.Add(PsQuote($"model_providers.{providerId}.query_params={{ \"api-version\" = \"{EscapeTomlString(apiVersion)}\" }}"));

                    break;
                }

                case ProviderRequestType.Anthropic:
                default:
                    throw new ArgumentOutOfRangeException(nameof(project.Provider.RequestType), project.Provider.RequestType, null);
            }
        }

        return (Command: string.Join(' ', args), Env: env);
    }

    private static (string Command, IReadOnlyDictionary<string, string>? Env) BuildClaudeLaunch(ProjectEntity project)
    {
        Dictionary<string, string>? env = null;

        if (project.Provider is not null)
        {
            if (project.Provider.RequestType != ProviderRequestType.Anthropic)
            {
                throw new InvalidOperationException("Claude Code projects require an Anthropic-compatible provider.");
            }

            env = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["ANTHROPIC_API_KEY"] = project.Provider.ApiKey,
                ["ANTHROPIC_BASE_URL"] = project.Provider.Address,
            };
        }

        var args = new List<string> { "claude" };
        if (!string.IsNullOrWhiteSpace(project.Model))
        {
            args.Add("--model");
            args.Add(PsQuote(project.Model!));
        }

        return (Command: string.Join(' ', args), Env: env);
    }

    private static string PsQuote(string value)
    {
        return $"'{value.Replace("'", "''", StringComparison.Ordinal)}'";
    }

    private static string EscapeTomlString(string value)
    {
        return value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\"", "\\\"", StringComparison.Ordinal);
    }
}
