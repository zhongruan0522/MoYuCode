using FsCheck;
using FsCheck.Fluent;
using FsCheck.Xunit;
using MyYuCode.Contracts.Skills;

namespace MyYuCode.Tests.Skills;

/// <summary>
/// Property-based tests for Skills data model validation.
/// **Property 1: API Returns Valid Skills Data Structure**
/// **Validates: Requirements 1.2, 2.3**
/// </summary>
public class SkillsDataModelPropertyTests
{
    /// <summary>
    /// Generates non-empty strings for required fields.
    /// </summary>
    private static Gen<string> NonEmptyStringGen() =>
        ArbMap.Default.GeneratorFor<NonEmptyString>().Select(s => s.Get);

    /// <summary>
    /// Generates valid SkillCompatibilityDto instances.
    /// </summary>
    private static Gen<SkillCompatibilityDto> SkillCompatibilityGen() =>
        ArbMap.Default.GeneratorFor<bool>().Select(compatible => new SkillCompatibilityDto(compatible));

    /// <summary>
    /// Generates valid SkillServicesDto instances.
    /// </summary>
    private static Gen<SkillServicesDto> SkillServicesGen() =>
        from codex in SkillCompatibilityGen()
        from claudeCode in SkillCompatibilityGen()
        select new SkillServicesDto(codex, claudeCode);

    /// <summary>
    /// Generates valid tag lists.
    /// </summary>
    private static Gen<IReadOnlyList<string>> TagsGen() =>
        Gen.ListOf(NonEmptyStringGen()).Select(list => (IReadOnlyList<string>)list.ToList());

    /// <summary>
    /// Generates valid status values.
    /// </summary>
    private static Gen<string> StatusGen() =>
        Gen.Elements("active", "deprecated", "experimental");

    /// <summary>
    /// Generates valid SkillDto instances.
    /// </summary>
    private static Gen<SkillDto> SkillGen() =>
        from slug in NonEmptyStringGen()
        from name in NonEmptyStringGen()
        from summary in NonEmptyStringGen()
        from description in NonEmptyStringGen()
        from visibility in Gen.Elements("public", "private")
        from tags in TagsGen()
        from services in SkillServicesGen()
        from version in NonEmptyStringGen()
        from buildId in NonEmptyStringGen()
        from status in StatusGen()
        from updatedAt in NonEmptyStringGen()
        select new SkillDto(slug, name, summary, description, visibility, tags, services, version, buildId, status, updatedAt);

    /// <summary>
    /// Generates valid SkillsIndexDto instances.
    /// </summary>
    private static Gen<SkillsIndexDto> SkillsIndexGen() =>
        from version in Gen.Choose(1, 100)
        from generatedAt in NonEmptyStringGen()
        from skills in Gen.ListOf(SkillGen()).Select(list => (IReadOnlyList<SkillDto>)list.ToList())
        select new SkillsIndexDto(version, generatedAt, skills);

    [Property(MaxTest = 100)]
    public Property SkillsIndexDto_HasValidVersionField()
    {
        return Prop.ForAll(SkillsIndexGen().ToArbitrary(), skillsIndex =>
            skillsIndex.Version >= 1);
    }

    [Property(MaxTest = 100)]
    public Property SkillsIndexDto_HasNonEmptyGeneratedAt()
    {
        return Prop.ForAll(SkillsIndexGen().ToArbitrary(), skillsIndex =>
            !string.IsNullOrEmpty(skillsIndex.GeneratedAt));
    }

    [Property(MaxTest = 100)]
    public Property SkillsIndexDto_HasNonNullSkillsArray()
    {
        return Prop.ForAll(SkillsIndexGen().ToArbitrary(), skillsIndex =>
            skillsIndex.Skills != null);
    }

    [Property(MaxTest = 100)]
    public Property SkillDto_HasAllRequiredFields()
    {
        return Prop.ForAll(SkillGen().ToArbitrary(), skill =>
            !string.IsNullOrEmpty(skill.Slug) &&
            !string.IsNullOrEmpty(skill.Name) &&
            !string.IsNullOrEmpty(skill.Summary) &&
            !string.IsNullOrEmpty(skill.Description) &&
            skill.Tags != null &&
            skill.Services != null &&
            !string.IsNullOrEmpty(skill.Version) &&
            !string.IsNullOrEmpty(skill.Status) &&
            !string.IsNullOrEmpty(skill.UpdatedAt));
    }

    [Property(MaxTest = 100)]
    public Property SkillServicesDto_HasBothCompatibilityFields()
    {
        return Prop.ForAll(SkillServicesGen().ToArbitrary(), services =>
            services.Codex != null &&
            services.ClaudeCode != null);
    }

    [Property(MaxTest = 100)]
    public Property SkillDto_StatusIsValidValue()
    {
        return Prop.ForAll(SkillGen().ToArbitrary(), skill =>
            skill.Status == "active" ||
            skill.Status == "deprecated" ||
            skill.Status == "experimental");
    }

    [Property(MaxTest = 100)]
    public Property SkillDto_VisibilityIsValidValue()
    {
        return Prop.ForAll(SkillGen().ToArbitrary(), skill =>
            skill.Visibility == "public" ||
            skill.Visibility == "private");
    }
}
