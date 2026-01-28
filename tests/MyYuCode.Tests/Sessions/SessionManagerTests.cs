using Microsoft.Extensions.Logging;
using Moq;
using MoYuCode.Data;
using MoYuCode.Data.Entities;
using MoYuCode.Services.Sessions;
using Xunit;

namespace MoYuCode.Tests.Sessions;

public class SessionManagerTests : IDisposable
{
    private readonly string _testDataDir;
    private readonly JsonDataStore _dataStore;
    private readonly SessionManager _sessionManager;

    public SessionManagerTests()
    {
        _testDataDir = Path.Combine(Path.GetTempPath(), $"myyucode-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_testDataDir);
        
        _dataStore = new JsonDataStore(_testDataDir);
        var logger = Mock.Of<ILogger<SessionManager>>();
        _sessionManager = new SessionManager(_dataStore, logger);
    }

    public void Dispose()
    {
        _dataStore.Dispose();
        if (Directory.Exists(_testDataDir))
        {
            Directory.Delete(_testDataDir, recursive: true);
        }
    }

    [Fact]
    public async Task CreateSessionAsync_CreatesNewSession()
    {
        // Arrange
        var projectId = Guid.NewGuid();
        var title = "Test Session";

        // Act
        var session = await _sessionManager.CreateSessionAsync(projectId, title);

        // Assert
        Assert.NotEqual(Guid.Empty, session.Id);
        Assert.Equal(projectId, session.ProjectId);
        Assert.Equal(title, session.Title);
        Assert.Equal(SessionState.Idle, session.State);
    }

    [Fact]
    public async Task CreateSessionAsync_WithoutTitle_GeneratesDefaultTitle()
    {
        // Arrange
        var projectId = Guid.NewGuid();

        // Act
        var session = await _sessionManager.CreateSessionAsync(projectId);

        // Assert
        Assert.NotEmpty(session.Title);
        Assert.StartsWith("会话", session.Title);
    }

    [Fact]
    public async Task DeleteSessionAsync_RemovesSession()
    {
        // Arrange
        var projectId = Guid.NewGuid();
        var session = await _sessionManager.CreateSessionAsync(projectId, "Test");

        // Act
        var result = await _sessionManager.DeleteSessionAsync(session.Id);

        // Assert
        Assert.True(result);
        Assert.Null(_sessionManager.GetSession(session.Id));
    }

    [Fact]
    public async Task DeleteSessionAsync_NonExistentSession_ReturnsFalse()
    {
        // Act
        var result = await _sessionManager.DeleteSessionAsync(Guid.NewGuid());

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task GetProjectSessions_ReturnsSessionsForProject()
    {
        // Arrange
        var projectId = Guid.NewGuid();
        await _sessionManager.CreateSessionAsync(projectId, "Session 1");
        await _sessionManager.CreateSessionAsync(projectId, "Session 2");
        await _sessionManager.CreateSessionAsync(Guid.NewGuid(), "Other Project Session");

        // Act
        var sessions = _sessionManager.GetProjectSessions(projectId);

        // Assert
        Assert.Equal(2, sessions.Count);
        Assert.All(sessions, s => Assert.Equal(projectId, s.ProjectId));
    }

    [Fact]
    public async Task GetRunningSessions_ReturnsOnlyRunningSessions()
    {
        // Arrange
        var projectId = Guid.NewGuid();
        var session1 = await _sessionManager.CreateSessionAsync(projectId, "Running");
        var session2 = await _sessionManager.CreateSessionAsync(projectId, "Idle");
        
        await _sessionManager.UpdateSessionStateAsync(session1.Id, SessionState.Running);

        // Act
        var runningSessions = _sessionManager.GetRunningSessions();

        // Assert
        Assert.Single(runningSessions);
        Assert.Equal(session1.Id, runningSessions[0].Id);
    }

    [Fact]
    public async Task UpdateSessionStateAsync_UpdatesState()
    {
        // Arrange
        var projectId = Guid.NewGuid();
        var session = await _sessionManager.CreateSessionAsync(projectId, "Test");

        // Act
        await _sessionManager.UpdateSessionStateAsync(session.Id, SessionState.Running);

        // Assert
        var updated = _sessionManager.GetSession(session.Id);
        Assert.NotNull(updated);
        Assert.Equal(SessionState.Running, updated.State);
    }

    [Fact]
    public async Task UpdateSessionStateAsync_CompletedState_SetsCompletedTime()
    {
        // Arrange
        var projectId = Guid.NewGuid();
        var session = await _sessionManager.CreateSessionAsync(projectId, "Test");

        // Act
        await _sessionManager.UpdateSessionStateAsync(session.Id, SessionState.Completed);

        // Assert
        var updated = _sessionManager.GetSession(session.Id);
        Assert.NotNull(updated);
        Assert.NotNull(updated.CompletedAtUtc);
    }

    [Fact]
    public async Task SwitchCurrentSessionAsync_UpdatesProjectCurrentSession()
    {
        // Arrange
        var projectId = Guid.NewGuid();
        var project = new ProjectEntity
        {
            Id = projectId,
            Name = "Test Project",
            WorkspacePath = "/test"
        };
        _dataStore.Add(project);
        await _dataStore.SaveDataAsync();

        var session = await _sessionManager.CreateSessionAsync(projectId, "Test");

        // Act
        var result = await _sessionManager.SwitchCurrentSessionAsync(projectId, session.Id);

        // Assert
        Assert.True(result);
        var updatedProject = _dataStore.GetProjectWithProvider(projectId);
        Assert.NotNull(updatedProject);
        Assert.Equal(session.Id, updatedProject.CurrentSessionId);
    }

    [Fact]
    public async Task SwitchCurrentSessionAsync_InvalidSession_ReturnsFalse()
    {
        // Arrange
        var projectId = Guid.NewGuid();
        var project = new ProjectEntity
        {
            Id = projectId,
            Name = "Test Project",
            WorkspacePath = "/test"
        };
        _dataStore.Add(project);
        await _dataStore.SaveDataAsync();

        // Act
        var result = await _sessionManager.SwitchCurrentSessionAsync(projectId, Guid.NewGuid());

        // Assert
        Assert.False(result);
    }
}
