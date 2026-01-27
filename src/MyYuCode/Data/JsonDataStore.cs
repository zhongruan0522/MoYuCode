using System.Collections.Concurrent;
using System.Text.Json;
using MyYuCode.Data.Entities;

namespace MyYuCode.Data;

public sealed class JsonDataStore : IDisposable
{
    private readonly string _dataDirectory;
    private readonly JsonSerializerOptions _jsonOptions;
    private readonly ConcurrentDictionary<Guid, ProjectEntity> _projects;
    private readonly ConcurrentDictionary<Guid, ProviderEntity> _providers;
    private readonly ConcurrentDictionary<ToolType, ToolSettingsEntity> _toolSettings;
    private readonly ConcurrentDictionary<Guid, SessionEntity> _sessions;
    private readonly ConcurrentDictionary<Guid, SessionMessageEntity> _sessionMessages;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private bool _disposed;

    public JsonDataStore(string dataDirectory)
    {
        _dataDirectory = dataDirectory ?? throw new ArgumentNullException(nameof(dataDirectory));
        Directory.CreateDirectory(_dataDirectory);

        _jsonOptions = new JsonSerializerOptions
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
        };

        _projects = new ConcurrentDictionary<Guid, ProjectEntity>();
        _providers = new ConcurrentDictionary<Guid, ProviderEntity>();
        _toolSettings = new ConcurrentDictionary<ToolType, ToolSettingsEntity>();
        _sessions = new ConcurrentDictionary<Guid, SessionEntity>();
        _sessionMessages = new ConcurrentDictionary<Guid, SessionMessageEntity>();

        // Load data on initialization
        LoadDataAsync().GetAwaiter().GetResult();
    }

    public IQueryable<ProjectEntity> Projects => _projects.Values.AsQueryable();

    public IQueryable<ProviderEntity> Providers => _providers.Values.AsQueryable();

    public IQueryable<ToolSettingsEntity> ToolSettings => _toolSettings.Values.AsQueryable();

    public IQueryable<SessionEntity> Sessions => _sessions.Values.AsQueryable();

    public IQueryable<SessionMessageEntity> SessionMessages => _sessionMessages.Values.AsQueryable();

    public async Task LoadDataAsync()
    {
        await _lock.WaitAsync();
        try
        {
            // Load providers
            var providersFile = Path.Combine(_dataDirectory, "providers.json");
            if (File.Exists(providersFile))
            {
                var json = await File.ReadAllTextAsync(providersFile);
                var providersList = JsonSerializer.Deserialize<List<ProviderEntity>>(json, _jsonOptions);
                if (providersList != null)
                {
                    _providers.Clear();
                    foreach (var provider in providersList)
                    {
                        _providers[provider.Id] = provider;
                    }
                }
            }

            // Load projects
            var projectsFile = Path.Combine(_dataDirectory, "projects.json");
            if (File.Exists(projectsFile))
            {
                var json = await File.ReadAllTextAsync(projectsFile);
                var projectsList = JsonSerializer.Deserialize<List<ProjectEntity>>(json, _jsonOptions);
                if (projectsList != null)
                {
                    _projects.Clear();
                    foreach (var project in projectsList)
                    {
                        project.LaunchEnvironment ??= new Dictionary<string, string>(StringComparer.Ordinal);
                        // Resolve provider reference
                        if (project.ProviderId.HasValue && _providers.TryGetValue(project.ProviderId.Value, out var provider))
                        {
                            project.Provider = provider;
                        }
                        _projects[project.Id] = project;
                    }
                }
            }

            // Load tool settings
            var toolSettingsFile = Path.Combine(_dataDirectory, "tool-settings.json");
            if (File.Exists(toolSettingsFile))
            {
                var json = await File.ReadAllTextAsync(toolSettingsFile);
                var settingsList = JsonSerializer.Deserialize<List<ToolSettingsEntity>>(json, _jsonOptions);
                if (settingsList != null)
                {
                    _toolSettings.Clear();
                    foreach (var settings in settingsList)
                    {
                        settings.LaunchEnvironment ??= new Dictionary<string, string>(StringComparer.Ordinal);
                        _toolSettings[settings.ToolType] = settings;
                    }
                }
            }

            // Load sessions
            var sessionsFile = Path.Combine(_dataDirectory, "sessions.json");
            if (File.Exists(sessionsFile))
            {
                var json = await File.ReadAllTextAsync(sessionsFile);
                var sessionsList = JsonSerializer.Deserialize<List<SessionEntity>>(json, _jsonOptions);
                if (sessionsList != null)
                {
                    _sessions.Clear();
                    foreach (var session in sessionsList)
                    {
                        _sessions[session.Id] = session;
                    }
                }
            }

            // Load session messages
            var messagesFile = Path.Combine(_dataDirectory, "session-messages.json");
            if (File.Exists(messagesFile))
            {
                var json = await File.ReadAllTextAsync(messagesFile);
                var messagesList = JsonSerializer.Deserialize<List<SessionMessageEntity>>(json, _jsonOptions);
                if (messagesList != null)
                {
                    _sessionMessages.Clear();
                    foreach (var message in messagesList)
                    {
                        _sessionMessages[message.Id] = message;
                    }
                }
            }
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task SaveDataAsync()
    {
        await _lock.WaitAsync();
        try
        {
            // Save providers
            var providersFile = Path.Combine(_dataDirectory, "providers.json");
            var providersList = _providers.Values.OrderBy(p => p.Name).ToList();
            var providersJson = JsonSerializer.Serialize(providersList, _jsonOptions);
            await File.WriteAllTextAsync(providersFile, providersJson);

            // Save projects
            var projectsFile = Path.Combine(_dataDirectory, "projects.json");
            var projectsList = _projects.Values.OrderBy(p => p.Name).ToList();
            var projectsJson = JsonSerializer.Serialize(projectsList, _jsonOptions);
            await File.WriteAllTextAsync(projectsFile, projectsJson);

            // Save tool settings
            var toolSettingsFile = Path.Combine(_dataDirectory, "tool-settings.json");
            var toolSettingsList = _toolSettings.Values.OrderBy(s => s.ToolType).ToList();
            var toolSettingsJson = JsonSerializer.Serialize(toolSettingsList, _jsonOptions);
            await File.WriteAllTextAsync(toolSettingsFile, toolSettingsJson);

            // Save sessions
            var sessionsFile = Path.Combine(_dataDirectory, "sessions.json");
            var sessionsList = _sessions.Values.OrderByDescending(s => s.UpdatedAtUtc).ToList();
            var sessionsJson = JsonSerializer.Serialize(sessionsList, _jsonOptions);
            await File.WriteAllTextAsync(sessionsFile, sessionsJson);

            // Save session messages
            var messagesFile = Path.Combine(_dataDirectory, "session-messages.json");
            var messagesList = _sessionMessages.Values.OrderBy(m => m.CreatedAtUtc).ToList();
            var messagesJson = JsonSerializer.Serialize(messagesList, _jsonOptions);
            await File.WriteAllTextAsync(messagesFile, messagesJson);
        }
        finally
        {
            _lock.Release();
        }
    }

    public void Add(ProjectEntity project)
    {
        if (project == null) throw new ArgumentNullException(nameof(project));
        _projects[project.Id] = project;
    }

    public void Add(ProviderEntity provider)
    {
        if (provider == null) throw new ArgumentNullException(nameof(provider));
        _providers[provider.Id] = provider;
    }

    public void Remove(ProjectEntity project)
    {
        if (project == null) throw new ArgumentNullException(nameof(project));
        _projects.TryRemove(project.Id, out _);
    }

    public void Remove(ProviderEntity provider)
    {
        if (provider == null) throw new ArgumentNullException(nameof(provider));
        _providers.TryRemove(provider.Id, out _);
    }

    public ProjectEntity? GetProjectWithProvider(Guid id)
    {
        if (_projects.TryGetValue(id, out var project))
        {
            // Load provider reference
            if (project.ProviderId.HasValue && _providers.TryGetValue(project.ProviderId.Value, out var provider))
            {
                project.Provider = provider;
            }
            return project;
        }
        return null;
    }

    public ToolSettingsEntity? GetToolSettings(ToolType toolType)
    {
        return _toolSettings.TryGetValue(toolType, out var settings) ? settings : null;
    }

    public ToolSettingsEntity GetOrCreateToolSettings(ToolType toolType)
    {
        if (_toolSettings.TryGetValue(toolType, out var settings))
        {
            return settings;
        }

        settings = new ToolSettingsEntity { ToolType = toolType };
        _toolSettings[toolType] = settings;
        return settings;
    }

    public bool ProviderExists(Guid id)
    {
        return _providers.ContainsKey(id);
    }

    // Session methods
    public void Add(SessionEntity session)
    {
        if (session == null) throw new ArgumentNullException(nameof(session));
        _sessions[session.Id] = session;
    }

    public void Remove(SessionEntity session)
    {
        if (session == null) throw new ArgumentNullException(nameof(session));
        _sessions.TryRemove(session.Id, out _);
    }

    public SessionEntity? GetSession(Guid id)
    {
        return _sessions.TryGetValue(id, out var session) ? session : null;
    }

    public List<SessionEntity> GetSessionsByProject(Guid projectId)
    {
        return _sessions.Values
            .Where(s => s.ProjectId == projectId)
            .OrderByDescending(s => s.UpdatedAtUtc)
            .ToList();
    }

    public List<SessionEntity> GetRunningSessions()
    {
        return _sessions.Values
            .Where(s => s.State == SessionState.Running)
            .OrderByDescending(s => s.UpdatedAtUtc)
            .ToList();
    }

    // Session message methods
    public void Add(SessionMessageEntity message)
    {
        if (message == null) throw new ArgumentNullException(nameof(message));
        _sessionMessages[message.Id] = message;

        // Update session message count
        if (_sessions.TryGetValue(message.SessionId, out var session))
        {
            session.MessageCount = _sessionMessages.Values.Count(m => m.SessionId == message.SessionId);
            session.UpdatedAtUtc = DateTimeOffset.UtcNow;
        }
    }

    public void RemoveSessionMessages(Guid sessionId)
    {
        var messagesToRemove = _sessionMessages.Values
            .Where(m => m.SessionId == sessionId)
            .Select(m => m.Id)
            .ToList();

        foreach (var id in messagesToRemove)
        {
            _sessionMessages.TryRemove(id, out _);
        }
    }

    public List<SessionMessageEntity> GetSessionMessages(Guid sessionId, int skip = 0, int take = 50)
    {
        return _sessionMessages.Values
            .Where(m => m.SessionId == sessionId)
            .OrderBy(m => m.CreatedAtUtc)
            .Skip(skip)
            .Take(take)
            .ToList();
    }

    public int GetSessionMessageCount(Guid sessionId)
    {
        return _sessionMessages.Values.Count(m => m.SessionId == sessionId);
    }

    public void Dispose()
    {
        if (_disposed) return;

        SaveDataAsync().GetAwaiter().GetResult();
        _lock.Dispose();
        _disposed = true;
    }
}
