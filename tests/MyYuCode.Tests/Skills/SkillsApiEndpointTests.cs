using System.Net;
using System.Text.Json;
using MyYuCode.Contracts.Skills;
using Xunit;

namespace MyYuCode.Tests.Skills;

/// <summary>
/// Unit tests for Skills API endpoint logic.
/// **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
/// </summary>
public class SkillsApiEndpointTests
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    [Fact]
    public void ParseValidSkillsJson_ReturnsSkillsIndexDto()
    {
        // Arrange
        var validSkillsJson = """
        {
            "version": 1,
            "generatedAt": "2026-01-27",
            "skills": [
                {
                    "slug": "system/plan",
                    "name": "Plan",
                    "summary": "Planning skill",
                    "description": "A skill for planning",
                    "visibility": "public",
                    "tags": ["planning"],
                    "services": {
                        "codex": { "compatible": true },
                        "claudeCode": { "compatible": true }
                    },
                    "version": "1.0.0",
                    "buildId": "20260127.1",
                    "status": "active",
                    "updatedAt": "2026-01-27T00:00:00Z"
                }
            ]
        }
        """;

        // Act
        var result = JsonSerializer.Deserialize<SkillsIndexDto>(validSkillsJson, JsonOptions);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(1, result.Version);
        Assert.Equal("2026-01-27", result.GeneratedAt);
        Assert.Single(result.Skills);
        Assert.Equal("system/plan", result.Skills[0].Slug);
        Assert.Equal("Plan", result.Skills[0].Name);
        Assert.Equal("active", result.Skills[0].Status);
    }

    [Fact]
    public void ParseEmptySkillsArray_ReturnsEmptyList()
    {
        // Arrange
        var emptySkillsJson = """
        {
            "version": 1,
            "generatedAt": "2026-01-27",
            "skills": []
        }
        """;

        // Act
        var result = JsonSerializer.Deserialize<SkillsIndexDto>(emptySkillsJson, JsonOptions);

        // Assert
        Assert.NotNull(result);
        Assert.NotNull(result.Skills);
        Assert.Empty(result.Skills);
    }

    [Fact]
    public void ParseMissingSkillsField_ReturnsNullSkills()
    {
        // Arrange
        var invalidJson = """
        {
            "version": 1,
            "generatedAt": "2026-01-27"
        }
        """;

        // Act
        var result = JsonSerializer.Deserialize<SkillsIndexDto>(invalidJson, JsonOptions);

        // Assert
        Assert.NotNull(result);
        Assert.Null(result.Skills); // Skills field is missing, so it's null
    }

    [Fact]
    public void ParseMalformedJson_ThrowsJsonException()
    {
        // Arrange
        var malformedJson = "{invalid json}";

        // Act & Assert
        Assert.Throws<JsonException>(() =>
            JsonSerializer.Deserialize<SkillsIndexDto>(malformedJson, JsonOptions));
    }

    [Fact]
    public void ParseMultipleSkills_ReturnsAllSkills()
    {
        // Arrange
        var multipleSkillsJson = """
        {
            "version": 1,
            "generatedAt": "2026-01-27",
            "skills": [
                {
                    "slug": "skill1",
                    "name": "Skill 1",
                    "summary": "First skill",
                    "description": "Description 1",
                    "visibility": "public",
                    "tags": ["tag1"],
                    "services": {
                        "codex": { "compatible": true },
                        "claudeCode": { "compatible": false }
                    },
                    "version": "1.0.0",
                    "buildId": "1",
                    "status": "active",
                    "updatedAt": "2026-01-27T00:00:00Z"
                },
                {
                    "slug": "skill2",
                    "name": "Skill 2",
                    "summary": "Second skill",
                    "description": "Description 2",
                    "visibility": "private",
                    "tags": ["tag2"],
                    "services": {
                        "codex": { "compatible": false },
                        "claudeCode": { "compatible": true }
                    },
                    "version": "2.0.0",
                    "buildId": "2",
                    "status": "deprecated",
                    "updatedAt": "2026-01-28T00:00:00Z"
                }
            ]
        }
        """;

        // Act
        var result = JsonSerializer.Deserialize<SkillsIndexDto>(multipleSkillsJson, JsonOptions);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(2, result.Skills.Count);
        Assert.Equal("skill1", result.Skills[0].Slug);
        Assert.Equal("skill2", result.Skills[1].Slug);
    }

    [Fact]
    public void SkillServices_ParsesCompatibilityCorrectly()
    {
        // Arrange
        var skillJson = """
        {
            "version": 1,
            "generatedAt": "2026-01-27",
            "skills": [
                {
                    "slug": "test",
                    "name": "Test",
                    "summary": "Test skill",
                    "description": "Test description",
                    "visibility": "public",
                    "tags": [],
                    "services": {
                        "codex": { "compatible": true },
                        "claudeCode": { "compatible": false }
                    },
                    "version": "1.0.0",
                    "buildId": "1",
                    "status": "active",
                    "updatedAt": "2026-01-27T00:00:00Z"
                }
            ]
        }
        """;

        // Act
        var result = JsonSerializer.Deserialize<SkillsIndexDto>(skillJson, JsonOptions);

        // Assert
        Assert.NotNull(result);
        var skill = result.Skills[0];
        Assert.True(skill.Services.Codex.Compatible);
        Assert.False(skill.Services.ClaudeCode.Compatible);
    }

    [Theory]
    [InlineData("active")]
    [InlineData("deprecated")]
    [InlineData("experimental")]
    public void SkillStatus_ParsesAllValidValues(string status)
    {
        // Arrange
        var skillJson = $$"""
        {
            "version": 1,
            "generatedAt": "2026-01-27",
            "skills": [
                {
                    "slug": "test",
                    "name": "Test",
                    "summary": "Test skill",
                    "description": "Test description",
                    "visibility": "public",
                    "tags": [],
                    "services": {
                        "codex": { "compatible": true },
                        "claudeCode": { "compatible": true }
                    },
                    "version": "1.0.0",
                    "buildId": "1",
                    "status": "{{status}}",
                    "updatedAt": "2026-01-27T00:00:00Z"
                }
            ]
        }
        """;

        // Act
        var result = JsonSerializer.Deserialize<SkillsIndexDto>(skillJson, JsonOptions);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(status, result.Skills[0].Status);
    }
}
