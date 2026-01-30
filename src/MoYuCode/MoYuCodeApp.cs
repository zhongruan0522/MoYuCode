using System.Text.Json.Serialization;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.WebSockets;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using MoYuCode.Api;
using MoYuCode.Data;
using MoYuCode.Hubs;
using MoYuCode.Infrastructure.Auth;
using MoYuCode.Services.A2a;
using MoYuCode.Services.Codex;
using MoYuCode.Services.Jobs;
using MoYuCode.Services.Sessions;
using MoYuCode.Services.Shell;
using Serilog;
using Serilog.Events;

namespace MoYuCode;

public static class MoYuCodeApp
{
    public const string DefaultUrl = "http://0.0.0.0:9110";

    public static WebApplication Create(string[]? args, out bool usingDefaultUrl)
    {
        args ??= Array.Empty<string>();
        var builder = WebApplication.CreateBuilder(args);

        var appDataRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".myyucode");
        Directory.CreateDirectory(appDataRoot);

        var logDirectory = Path.Combine(
            appDataRoot,
            "logs");
        Directory.CreateDirectory(logDirectory);
        var errorLogPath = Path.Combine(logDirectory, "myyucode-error-.log");

        builder.Host.UseSerilog((context, _, loggerConfiguration) =>
        {
            loggerConfiguration
                .ReadFrom.Configuration(context.Configuration)
                .WriteTo.File(
                    errorLogPath,
                    restrictedToMinimumLevel: LogEventLevel.Error,
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 14);
        });

        var hasUrls = !string.IsNullOrWhiteSpace(builder.Configuration["urls"])
            || !string.IsNullOrWhiteSpace(builder.Configuration["ASPNETCORE_URLS"]);
        var hasKestrelEndpoints = builder.Configuration.GetSection("Kestrel:Endpoints").GetChildren().Any();
        usingDefaultUrl = !hasUrls && !hasKestrelEndpoints;
        if (usingDefaultUrl)
        {
            builder.WebHost.UseUrls(DefaultUrl);
        }

        builder.Services.AddOpenApi();
        builder.Services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
        });

        builder.Services.AddCors(options =>
        {
            options.AddDefaultPolicy(policy =>
                policy.SetIsOriginAllowed(_ => true)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials());
        });

        var authSettings = AuthSettings.FromConfiguration(builder.Configuration);
        builder.Services.AddSingleton(authSettings);

        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(authSettings.JwtSigningKey));

                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = false,
                    ValidateAudience = false,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = signingKey,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(1),
                };

                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        var accessToken = context.Request.Query["access_token"];
                        if (!string.IsNullOrWhiteSpace(accessToken))
                        {
                            // 浏览器原生 WebSocket / EventSource 都无法设置自定义 Authorization Header，
                            // 这里对 WS 与 SSE 允许通过 query string 传 access_token。
                            var isWebSocket = context.HttpContext.WebSockets.IsWebSocketRequest;
                            var accept = context.Request.Headers.Accept.ToString();
                            var isSse = accept.Contains("text/event-stream", StringComparison.OrdinalIgnoreCase);

                            if (isWebSocket || isSse)
                            {
                                context.Token = accessToken;
                            }
                        }

                        return Task.CompletedTask;
                    },
                };
            });

        builder.Services.AddAuthorization(options =>
        {
            // 默认：所有接口都需要登录（JWT）。需要匿名的接口必须显式 AllowAnonymous。
            options.FallbackPolicy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .Build();
        });

        // Add SignalR
        builder.Services.AddSignalR();

        builder.Services.AddSingleton<JsonDataStore>(sp => new JsonDataStore(appDataRoot));

        builder.Services.AddHttpClient();
        builder.Services.AddMemoryCache();
        builder.Services.AddSingleton<JobManager>();
        builder.Services.AddSingleton<PowerShellLauncher>();
        builder.Services.AddSingleton<TerminalWindowLauncher>();
        builder.Services.AddSingleton<TerminalMuxSessionManager>();
        builder.Services.AddSingleton<A2aTaskManager>();
        builder.Services.AddSingleton<CodexAppServerClient>();
        builder.Services.AddSingleton<CodexSessionManager>();

        // Session management services
        builder.Services.AddSingleton<SessionManager>();
        builder.Services.AddSingleton<SessionMessageRepository>();
        builder.Services.AddWebSockets((o) =>
        {
            
        });

        var app = builder.Build();
        try
        {

            var embeddedWebRoot = new ManifestEmbeddedFileProvider(typeof(Program).Assembly, "wwwroot");

            app.UseDefaultFiles(new DefaultFilesOptions
            {
                FileProvider = embeddedWebRoot,
            });

            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = embeddedWebRoot,
            });

            app.MapFallback(async context =>
            {
                if (context.Request.Path.StartsWithSegments("/api")
                    || context.Request.Path.StartsWithSegments("/media")
                    || context.Request.Path.StartsWithSegments("/terminal")
                    || context.Request.Path.StartsWithSegments("/a2a")
                    || context.Request.Path.StartsWithSegments("/.well-known"))
                {
                    context.Response.StatusCode = StatusCodes.Status404NotFound;
                    return;
                }

                var requestPath = context.Request.Path.Value ?? string.Empty;
                if (Path.HasExtension(requestPath))
                {
                    context.Response.StatusCode = StatusCodes.Status404NotFound;
                    return;
                }

                var indexFile = embeddedWebRoot.GetFileInfo("index.html");
                if (!indexFile.Exists)
                {
                    context.Response.StatusCode = StatusCodes.Status404NotFound;
                    return;
                }

                context.Response.ContentType = "text/html; charset=utf-8";
                await using var stream = indexFile.CreateReadStream();
                await stream.CopyToAsync(context.Response.Body);
            }).AllowAnonymous();

        }
        catch (Exception ex)
        {
            app.Logger.LogError(ex, "Failed to configure embedded web UI/static files.");
        }

        app.UseCors();
        app.UseSerilogRequestLogging();
        app.UseWebSockets();
        app.UseAuthentication();
        app.UseAuthorization();

        // Map all endpoints with /api prefix
        app.MapMyYuCodeApis();
        app.MapA2a();
        app.MapMedia();
        app.MapTerminal();
        app.MapInfo();
        app.MapSessionsEndpoints();

        // Map SignalR hub
        app.MapHub<ChatHub>("/api/chat");

        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
        }

        if (usingDefaultUrl)
        {
            app.Logger.LogInformation("Default URL binding active: {Url}", DefaultUrl);
        }

        return app;
    }
}
