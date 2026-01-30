using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using MoYuCode.Infrastructure.Auth;

namespace MoYuCode.Api;

public static class AuthEndpoints
{
    public static void MapAuth(this RouteGroupBuilder api)
    {
        var auth = api.MapGroup("/auth");

        auth.MapPost("/login", (LoginRequest request, AuthSettings authSettings) =>
            {
                if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrEmpty(request.Password))
                {
                    throw new ApiHttpException(StatusCodes.Status400BadRequest, "Username and password are required.");
                }

                if (!IsValidCredentials(request, authSettings))
                {
                    throw new ApiHttpException(StatusCodes.Status401Unauthorized, "Invalid credentials.", "invalid_credentials");
                }

                var nowUtc = DateTime.UtcNow;
                var expiresAtUtc = nowUtc.Add(authSettings.JwtLifetime);
                var token = CreateJwtToken(authSettings, request.Username.Trim(), nowUtc, expiresAtUtc);

                return new LoginResponse(
                    AccessToken: token,
                    TokenType: "Bearer",
                    ExpiresAtUtc: expiresAtUtc);
            })
            .AllowAnonymous();
    }

    private static bool IsValidCredentials(LoginRequest request, AuthSettings authSettings)
    {
        var userOk = FixedTimeEquals(request.Username!.Trim(), authSettings.AdminUsername);
        var passOk = FixedTimeEquals(request.Password!, authSettings.AdminPassword);
        return userOk && passOk;
    }

    private static bool FixedTimeEquals(string left, string right)
    {
        var leftBytes = Encoding.UTF8.GetBytes(left);
        var rightBytes = Encoding.UTF8.GetBytes(right);
        return leftBytes.Length == rightBytes.Length && CryptographicOperations.FixedTimeEquals(leftBytes, rightBytes);
    }

    private static string CreateJwtToken(AuthSettings authSettings, string username, DateTime nowUtc, DateTime expiresAtUtc)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(authSettings.JwtSigningKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, username),
            new Claim(ClaimTypes.Name, username),
            new Claim(ClaimTypes.Role, "admin"),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
        };

        var token = new JwtSecurityToken(
            issuer: null,
            audience: null,
            claims: claims,
            notBefore: nowUtc,
            expires: expiresAtUtc,
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public sealed record LoginRequest(string? Username, string? Password);

    public sealed record LoginResponse(string AccessToken, string TokenType, DateTime ExpiresAtUtc);
}
