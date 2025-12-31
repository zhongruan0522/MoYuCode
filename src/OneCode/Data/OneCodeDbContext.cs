using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using OneCode.Data.Entities;

namespace OneCode.Data;

public sealed class OneCodeDbContext(DbContextOptions<OneCodeDbContext> options) : DbContext(options)
{
    public DbSet<ProjectEntity> Projects => Set<ProjectEntity>();

    public DbSet<ProviderEntity> Providers => Set<ProviderEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<ProjectEntity>(entity =>
        {
            entity.HasIndex(x => new { x.ToolType, x.Name }).IsUnique();
            entity.HasOne(x => x.Provider)
                .WithMany()
                .HasForeignKey(x => x.ProviderId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        var listToJsonConverter = new ValueConverter<List<string>, string>(
            list => JsonSerializer.Serialize(list ?? new List<string>(), JsonSerializerOptions.Default),
            json => JsonSerializer.Deserialize<List<string>>(json, JsonSerializerOptions.Default) ?? new List<string>());

        var listComparer = new ValueComparer<List<string>>(
            (a, b) =>
                ReferenceEquals(a, b) ||
                (a != null && b != null && a.SequenceEqual(b)),
            a => a == null
                ? 0
                : a.Aggregate(0, (hash, v) => HashCode.Combine(hash, v.GetHashCode(StringComparison.Ordinal))),
            a => a == null ? new List<string>() : a.ToList());

        modelBuilder.Entity<ProviderEntity>(entity =>
        {
            entity.Property(x => x.Models)
                .HasConversion(listToJsonConverter)
                .Metadata.SetValueComparer(listComparer);
        });
    }
}
