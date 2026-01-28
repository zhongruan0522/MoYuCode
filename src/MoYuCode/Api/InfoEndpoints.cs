using System.Reflection;
using MoYuCode.Contracts.App;

namespace MoYuCode.Api;

public static class InfoEndpoints
{
    public static void MapInfo(this WebApplication app)
    {
        var api = app.MapGroup("/api")
            .AddEndpointFilter<ApiResponseEndpointFilter>();

        api.MapGet("/version", () =>
        {
            var assembly = Assembly.GetExecutingAssembly();

            var informationalVersion = assembly
                .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
                ?.InformationalVersion;

            var assemblyVersion = assembly.GetName().Version?.ToString();
            var version = ExtractDisplayVersion(informationalVersion) ?? assemblyVersion ?? "unknown";

            return new AppVersionDto(
                Version: version,
                InformationalVersion: informationalVersion,
                AssemblyVersion: assemblyVersion);
        });
    }

    private static string? ExtractDisplayVersion(string? informationalVersion)
    {
        if (string.IsNullOrWhiteSpace(informationalVersion))
        {
            return null;
        }

        var trimmed = informationalVersion.Trim();
        var plusIndex = trimmed.IndexOf('+', StringComparison.Ordinal);
        return plusIndex >= 0 ? trimmed[..plusIndex] : trimmed;
    }
}

