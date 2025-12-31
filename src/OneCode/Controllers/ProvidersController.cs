using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OneCode.Contracts.Providers;
using OneCode.Data;
using OneCode.Data.Entities;

namespace OneCode.Controllers;

[ApiController]
[Route("api/providers")]
public sealed class ProvidersController(OneCodeDbContext db, IHttpClientFactory httpClientFactory) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ProviderDto>>> List(CancellationToken cancellationToken)
    {
        var providers = await db.Providers
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);

        return Ok(providers.Select(ToDto).ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProviderDto>> Get(Guid id, CancellationToken cancellationToken)
    {
        var provider = await db.Providers.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        return provider is null ? NotFound() : Ok(ToDto(provider));
    }

    [HttpPost]
    public async Task<ActionResult<ProviderDto>> Create([FromBody] ProviderUpsertRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Address))
        {
            return BadRequest("Name and Address are required.");
        }

        if (string.IsNullOrWhiteSpace(request.ApiKey))
        {
            return BadRequest("ApiKey is required.");
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
            Models = [],
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow,
        };

        db.Providers.Add(entity);
        await db.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(Get), new { id = entity.Id }, ToDto(entity));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProviderDto>> Update(Guid id, [FromBody] ProviderUpsertRequest request, CancellationToken cancellationToken)
    {
        var entity = await db.Providers.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (entity is null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Address))
        {
            return BadRequest("Name and Address are required.");
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
        return Ok(ToDto(entity));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var entity = await db.Providers.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (entity is null)
        {
            return NotFound();
        }

        db.Providers.Remove(entity);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/refresh-models")]
    public async Task<ActionResult<ProviderDto>> RefreshModels(Guid id, CancellationToken cancellationToken)
    {
        var entity = await db.Providers.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (entity is null)
        {
            return NotFound();
        }

        var models = await FetchModelsAsync(entity, cancellationToken);
        entity.Models = models.Distinct(StringComparer.Ordinal).OrderBy(x => x, StringComparer.Ordinal).ToList();
        entity.ModelsRefreshedAtUtc = DateTimeOffset.UtcNow;
        entity.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Ok(ToDto(entity));
    }

    private async Task<IReadOnlyList<string>> FetchModelsAsync(ProviderEntity provider, CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient();

        return provider.RequestType switch
        {
            ProviderRequestType.OpenAI => await FetchOpenAiModelsAsync(client, provider, cancellationToken),
            ProviderRequestType.OpenAIResponses => await FetchOpenAiModelsAsync(client, provider, cancellationToken),
            ProviderRequestType.AzureOpenAI => await FetchAzureDeploymentsAsync(client, provider, cancellationToken),
            ProviderRequestType.Anthropic => await FetchAnthropicModelsAsync(client, provider, cancellationToken),
            _ => [],
        };
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
            return [];
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
            return [];
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
            return [];
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
}

