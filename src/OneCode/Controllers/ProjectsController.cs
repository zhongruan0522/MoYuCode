using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OneCode.Contracts.Projects;
using OneCode.Data;
using OneCode.Data.Entities;
using OneCode.Services.Shell;

namespace OneCode.Controllers;

[ApiController]
[Route("api/projects")]
public sealed class ProjectsController(OneCodeDbContext db, PowerShellLauncher powerShellLauncher) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ProjectDto>>> List([FromQuery] ToolType toolType, CancellationToken cancellationToken)
    {
        var projects = await db.Projects
            .Include(x => x.Provider)
            .Where(x => x.ToolType == toolType)
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);

        return Ok(projects.Select(ToDto).ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProjectDto>> Get(Guid id, CancellationToken cancellationToken)
    {
        var project = await db.Projects
            .Include(x => x.Provider)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

        return project is null ? NotFound() : Ok(ToDto(project));
    }

    [HttpPost]
    public async Task<ActionResult<ProjectDto>> Create([FromBody] ProjectUpsertRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        if (string.IsNullOrWhiteSpace(request.WorkspacePath))
        {
            return BadRequest("WorkspacePath is required.");
        }

        if (!Directory.Exists(request.WorkspacePath))
        {
            return BadRequest("WorkspacePath does not exist.");
        }

        if (request.ProviderId.HasValue)
        {
            var providerExists = await db.Providers.AnyAsync(x => x.Id == request.ProviderId, cancellationToken);
            if (!providerExists)
            {
                return BadRequest("ProviderId does not exist.");
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
            return Conflict("Project name already exists for this tool type.");
        }

        await db.Entry(entity).Reference(x => x.Provider).LoadAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = entity.Id }, ToDto(entity));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProjectDto>> Update(Guid id, [FromBody] ProjectUpsertRequest request, CancellationToken cancellationToken)
    {
        var entity = await db.Projects.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (entity is null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        if (string.IsNullOrWhiteSpace(request.WorkspacePath))
        {
            return BadRequest("WorkspacePath is required.");
        }

        if (!Directory.Exists(request.WorkspacePath))
        {
            return BadRequest("WorkspacePath does not exist.");
        }

        if (request.ProviderId.HasValue)
        {
            var providerExists = await db.Providers.AnyAsync(x => x.Id == request.ProviderId, cancellationToken);
            if (!providerExists)
            {
                return BadRequest("ProviderId does not exist.");
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
            return Conflict("Project name already exists for this tool type.");
        }

        await db.Entry(entity).Reference(x => x.Provider).LoadAsync(cancellationToken);
        return Ok(ToDto(entity));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var entity = await db.Projects.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (entity is null)
        {
            return NotFound();
        }

        db.Projects.Remove(entity);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/start")]
    public async Task<IActionResult> Start(Guid id, CancellationToken cancellationToken)
    {
        var project = await db.Projects
            .Include(x => x.Provider)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

        if (project is null)
        {
            return NotFound();
        }

        if (!Directory.Exists(project.WorkspacePath))
        {
            return BadRequest("WorkspacePath does not exist.");
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
            return BadRequest(ex.Message);
        }

        powerShellLauncher.LaunchNewWindow(
            workingDirectory: project.WorkspacePath,
            windowTitle: $"OneCode - {project.ToolType} - {project.Name}",
            command: launch.Command,
            environment: launch.Env);

        project.LastStartedAtUtc = DateTimeOffset.UtcNow;
        project.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Ok();
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
            "--cd", PsQuote(project.WorkspacePath),
        };

        if (!string.IsNullOrWhiteSpace(project.Model))
        {
            args.Add("--model");
            args.Add(PsQuote(project.Model!));
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
