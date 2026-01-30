using System.Globalization;

namespace MoYuCode.Infrastructure.Auth;

/// <summary>
/// 仅用于单管理员登录的鉴权配置（从环境变量读取）。
/// </summary>
public sealed record AuthSettings(
    string AdminUsername,
    string AdminPassword,
    string JwtSigningKey,
    TimeSpan JwtLifetime)
{
    public const string AdminUsernameKey = "MOYU_ADMIN_USERNAME";
    public const string AdminPasswordKey = "MOYU_ADMIN_PASSWORD";
    public const string JwtSigningKeyKey = "MOYU_JWT_SIGNING_KEY";
    public const string JwtExpiresHoursKey = "MOYU_JWT_EXPIRES_HOURS";

    public static AuthSettings FromConfiguration(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        var adminUsername = configuration[AdminUsernameKey];
        if (string.IsNullOrWhiteSpace(adminUsername))
        {
            throw new InvalidOperationException($"Missing required configuration: {AdminUsernameKey}");
        }

        var adminPassword = configuration[AdminPasswordKey];
        if (string.IsNullOrEmpty(adminPassword))
        {
            throw new InvalidOperationException($"Missing required configuration: {AdminPasswordKey}");
        }

        var jwtSigningKey = configuration[JwtSigningKeyKey];
        if (string.IsNullOrWhiteSpace(jwtSigningKey))
        {
            throw new InvalidOperationException($"Missing required configuration: {JwtSigningKeyKey}");
        }

        // HMAC-SHA256 对称密钥建议至少 256-bit（32 bytes）以上。
        if (jwtSigningKey.Length < 32)
        {
            throw new InvalidOperationException($"{JwtSigningKeyKey} must be at least 32 characters.");
        }

        var expiresHours = 24;
        var expiresRaw = configuration[JwtExpiresHoursKey];
        if (!string.IsNullOrWhiteSpace(expiresRaw))
        {
            if (!int.TryParse(expiresRaw, NumberStyles.Integer, CultureInfo.InvariantCulture, out expiresHours)
                || expiresHours <= 0
                || expiresHours > 24 * 30)
            {
                throw new InvalidOperationException($"{JwtExpiresHoursKey} must be a positive integer (hours).");
            }
        }

        return new AuthSettings(
            AdminUsername: adminUsername.Trim(),
            AdminPassword: adminPassword,
            JwtSigningKey: jwtSigningKey,
            JwtLifetime: TimeSpan.FromHours(expiresHours));
    }
}
