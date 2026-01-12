using MyYuCode.Data.Entities;

namespace MyYuCode.Contracts.Providers;

public sealed record ProviderUpsertRequest(
    string Name,
    string Address,
    string? Logo,
    string ApiKey,
    ProviderRequestType RequestType,
    string? AzureApiVersion);

public sealed record ProviderModelUpdateRequest(string Model);

