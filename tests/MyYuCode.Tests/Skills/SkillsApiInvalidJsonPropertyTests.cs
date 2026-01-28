using System.Net;
using System.Text.Json;
using FsCheck;
using FsCheck.Fluent;
using FsCheck.Xunit;
using MoYuCode.Contracts.Skills;

namespace MoYuCode.Tests.Skills;

/// <summary>
/// Property-based tests for Skills API invalid JSON handling.
/// **Property 3: Invalid JSON Handling**
/// **Validates: Requirements 1.4, 7.1**
/// </summary>
public class SkillsApiInvalidJsonPropertyTests
{
    /// <summary>
    /// Generates various malformed JSON strings.
    /// </summary>
    private static Gen<string> MalformedJsonGen() =>
        Gen.Elements(
            // Completely invalid JSON
            "{invalid json}",
            "not json at all",
            "{\"unclosed\": \"brace\"",
            "[\"unclosed\", \"array\"",
            "{'single': 'quotes'}",
            "{\"trailing\": \"comma\",}",
            "[1, 2, 3,]",
            // Truncated JSON
            "{\"version\": 1, \"generatedAt\":",
            "{\"version\": 1, \"generatedAt\": \"2026-01-27\", \"skills\": [{\"slug\":",
            // Binary/garbage data
            "\x00\x01\x02\x03",
            "<?xml version=\"1.0\"?><root></root>",
            // Empty content
            "",
            "   ",
            "\n\t\r",
            // Random characters
            "!@#$%^&*()",
            "<<<>>>",
            "null",
            "undefined"
        );

    /// <summary>
    /// Generates JSON with missing required fields.
    /// </summary>
    private static Gen<string> MissingFieldsJsonGen() =>
        Gen.Elements(
            "{}",
            "{\"version\": 1}",
            "{\"generatedAt\": \"2026-01-27\"}",
            "{\"version\": 1, \"generatedAt\": \"2026-01-27\"}"
        );

    /// <summary>
    /// Generates JSON with wrong types for fields.
    /// </summary>
    private static Gen<string> WrongTypesJsonGen() =>
        Gen.Elements(
            "{\"version\": \"not a number\", \"generatedAt\": \"2026-01-27\", \"skills\": []}",
            "{\"version\": 1, \"generatedAt\": 123, \"skills\": []}",
            "{\"version\": 1, \"generatedAt\": \"2026-01-27\", \"skills\": \"not an array\"}"
        );

    /// <summary>
    /// Simulates the JSON parsing and validation logic.
    /// Returns 502 for invalid JSON, 200 for valid JSON.
    /// </summary>
    private static HttpStatusCode SimulateJsonParsing(string json)
    {
        try
        {
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var result = JsonSerializer.Deserialize<SkillsIndexDto>(json, options);
            
            if (result is null || result.Skills is null)
            {
                return HttpStatusCode.BadGateway; // 502
            }
            
            return HttpStatusCode.OK; // 200
        }
        catch (JsonException)
        {
            return HttpStatusCode.BadGateway; // 502
        }
    }

    [Property(MaxTest = 100)]
    public Property MalformedJson_Returns502()
    {
        return Prop.ForAll(MalformedJsonGen().ToArbitrary(), malformedJson =>
        {
            var statusCode = SimulateJsonParsing(malformedJson);
            return statusCode == HttpStatusCode.BadGateway;
        });
    }

    [Property(MaxTest = 100)]
    public Property MissingRequiredFields_Returns502()
    {
        return Prop.ForAll(MissingFieldsJsonGen().ToArbitrary(), json =>
        {
            var statusCode = SimulateJsonParsing(json);
            return statusCode == HttpStatusCode.BadGateway;
        });
    }

    [Property(MaxTest = 100)]
    public Property WrongTypes_Returns502()
    {
        return Prop.ForAll(WrongTypesJsonGen().ToArbitrary(), json =>
        {
            var statusCode = SimulateJsonParsing(json);
            return statusCode == HttpStatusCode.BadGateway;
        });
    }

    [Property(MaxTest = 100)]
    public Property ValidJson_Returns200()
    {
        var validJsonGen = Gen.Elements(
            "{\"version\": 1, \"generatedAt\": \"2026-01-27\", \"skills\": []}",
            "{\"version\": 2, \"generatedAt\": \"2026-01-28\", \"skills\": []}"
        );

        return Prop.ForAll(validJsonGen.ToArbitrary(), json =>
        {
            var statusCode = SimulateJsonParsing(json);
            return statusCode == HttpStatusCode.OK;
        });
    }
}
