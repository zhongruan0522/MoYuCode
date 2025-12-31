using OneCode.Data.Entities;

namespace OneCode.Contracts.Providers;

public sealed record ProviderDto(
    Guid Id,
    string Name,
    string Address,
    string? Logo,
    ProviderRequestType RequestType,
    string? AzureApiVersion,
    bool HasApiKey,
    string? ApiKeyLast4,
    IReadOnlyList<string> Models,
    DateTimeOffset? ModelsRefreshedAtUtc);

