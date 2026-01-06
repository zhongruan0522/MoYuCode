using System.Collections.Concurrent;
using System.Text.Json;

namespace OneCode.Services.Codex;

public sealed class CodexSessionManager
{
    private readonly CodexAppServerClient _client;

    private readonly ConcurrentDictionary<string, SessionState> _sessions = new(StringComparer.Ordinal);

    public CodexSessionManager(CodexAppServerClient client)
    {
        _client = client;
    }

    public async Task<CodexThreadRef> GetOrCreateThreadAsync(
        string sessionId,
        string cwd,
        string? modelProvider,
        CancellationToken cancellationToken)
    {
        var providerKey = string.IsNullOrWhiteSpace(modelProvider) ? string.Empty : modelProvider.Trim();
        var state = _sessions.GetOrAdd(sessionId, _ => new SessionState());
        await state.Lock.WaitAsync(cancellationToken);
        try
        {
            if (state.Threads.TryGetValue(providerKey, out var existing))
            {
                return existing;
            }

            var result = await _client.CallAsync(
                method: "thread/start",
                @params: new
                {
                    cwd,
                    approvalPolicy = "never",
                    sandbox = "danger-full-access",
                    modelProvider = string.IsNullOrWhiteSpace(providerKey) ? null : providerKey,
                },
                cancellationToken);

            var threadId = TryReadString(result, "thread", "id")
                ?? throw new InvalidOperationException("codex thread/start missing result.thread.id");

            var path = TryReadString(result, "path");
            var thread = new CodexThreadRef(
                SessionId: sessionId,
                ThreadId: threadId,
                Cwd: cwd,
                SessionPath: path);

            state.Threads[providerKey] = thread;
            return thread;
        }
        finally
        {
            state.Lock.Release();
        }
    }

    private static string? TryReadString(JsonElement element, params string[] path)
    {
        var current = element;
        foreach (var segment in path)
        {
            if (current.ValueKind != JsonValueKind.Object
                || !current.TryGetProperty(segment, out current))
            {
                return null;
            }
        }

        return current.ValueKind == JsonValueKind.String ? current.GetString() : null;
    }

    private sealed class SessionState
    {
        public SemaphoreSlim Lock { get; } = new(1, 1);

        public Dictionary<string, CodexThreadRef> Threads { get; } = new(StringComparer.Ordinal);
    }
}

public sealed record CodexThreadRef(
    string SessionId,
    string ThreadId,
    string Cwd,
    string? SessionPath);
