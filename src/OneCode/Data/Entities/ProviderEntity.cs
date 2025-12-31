using System.ComponentModel.DataAnnotations;

namespace OneCode.Data.Entities;

public enum ProviderRequestType
{
    AzureOpenAI = 0,
    OpenAI = 1,
    OpenAIResponses = 2,
    Anthropic = 3,
}

public sealed class ProviderEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = "";

    [Required]
    [MaxLength(2048)]
    public string Address { get; set; } = "";

    [MaxLength(2048)]
    public string? Logo { get; set; }

    [Required]
    public string ApiKey { get; set; } = "";

    public ProviderRequestType RequestType { get; set; }

    [MaxLength(64)]
    public string? AzureApiVersion { get; set; }

    public List<string> Models { get; set; } = [];

    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? ModelsRefreshedAtUtc { get; set; }
}

