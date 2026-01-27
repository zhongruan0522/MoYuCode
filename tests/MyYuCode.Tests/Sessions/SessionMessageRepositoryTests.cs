using Microsoft.Extensions.Logging;
using Moq;
using MyYuCode.Data;
using MyYuCode.Data.Entities;
using MyYuCode.Services.Sessions;
using Xunit;

namespace MyYuCode.Tests.Sessions;

public class SessionMessageRepositoryTests : IDisposable
{
    private readonly string _testDataDir;
    private readonly JsonDataStore _dataStore;
    private readonly SessionMessageRepository _repository;

    public SessionMessageRepositoryTests()
    {
        _testDataDir = Path.Combine(Path.GetTempPath(), $"myyucode-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_testDataDir);
        
        _dataStore = new JsonDataStore(_testDataDir);
        var logger = Mock.Of<ILogger<SessionMessageRepository>>();
        _repository = new SessionMessageRepository(_dataStore, logger);
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
    public async Task SaveMessageAsync_CreatesNewMessage()
    {
        // Arrange
        var sessionId = Guid.NewGuid();
        var content = "Hello, world!";

        // Act
        var message = await _repository.SaveMessageAsync(
            sessionId,
            MessageRole.User,
            content,
            MessageType.Text);

        // Assert
        Assert.NotEqual(Guid.Empty, message.Id);
        Assert.Equal(sessionId, message.SessionId);
        Assert.Equal(MessageRole.User, message.Role);
        Assert.Equal(content, message.Content);
        Assert.Equal(MessageType.Text, message.MessageType);
    }

    [Fact]
    public async Task GetMessages_ReturnsPaginatedMessages()
    {
        // Arrange
        var sessionId = Guid.NewGuid();
        for (int i = 0; i < 10; i++)
        {
            await _repository.SaveMessageAsync(sessionId, MessageRole.User, $"Message {i}");
        }

        // Act
        var (messages, total) = _repository.GetMessages(sessionId, skip: 2, take: 3);

        // Assert
        Assert.Equal(3, messages.Count);
        Assert.Equal(10, total);
    }

    [Fact]
    public async Task GetMessages_ReturnsMessagesInOrder()
    {
        // Arrange
        var sessionId = Guid.NewGuid();
        await _repository.SaveMessageAsync(sessionId, MessageRole.User, "First");
        await Task.Delay(10); // Ensure different timestamps
        await _repository.SaveMessageAsync(sessionId, MessageRole.Agent, "Second");
        await Task.Delay(10);
        await _repository.SaveMessageAsync(sessionId, MessageRole.User, "Third");

        // Act
        var (messages, _) = _repository.GetMessages(sessionId);

        // Assert
        Assert.Equal("First", messages[0].Content);
        Assert.Equal("Second", messages[1].Content);
        Assert.Equal("Third", messages[2].Content);
    }

    [Fact]
    public async Task DeleteSessionMessagesAsync_RemovesAllMessages()
    {
        // Arrange
        var sessionId = Guid.NewGuid();
        await _repository.SaveMessageAsync(sessionId, MessageRole.User, "Message 1");
        await _repository.SaveMessageAsync(sessionId, MessageRole.Agent, "Message 2");

        // Act
        await _repository.DeleteSessionMessagesAsync(sessionId);

        // Assert
        var count = _repository.GetMessageCount(sessionId);
        Assert.Equal(0, count);
    }

    [Fact]
    public async Task GetMessageCount_ReturnsCorrectCount()
    {
        // Arrange
        var sessionId = Guid.NewGuid();
        await _repository.SaveMessageAsync(sessionId, MessageRole.User, "Message 1");
        await _repository.SaveMessageAsync(sessionId, MessageRole.Agent, "Message 2");
        await _repository.SaveMessageAsync(sessionId, MessageRole.User, "Message 3");

        // Act
        var count = _repository.GetMessageCount(sessionId);

        // Assert
        Assert.Equal(3, count);
    }

    [Fact]
    public async Task SaveMessageAsync_DifferentMessageTypes()
    {
        // Arrange
        var sessionId = Guid.NewGuid();

        // Act
        var textMessage = await _repository.SaveMessageAsync(sessionId, MessageRole.User, "Text", MessageType.Text);
        var toolMessage = await _repository.SaveMessageAsync(sessionId, MessageRole.Agent, "Tool", MessageType.Tool);
        var statusMessage = await _repository.SaveMessageAsync(sessionId, MessageRole.System, "Status", MessageType.Status);

        // Assert
        Assert.Equal(MessageType.Text, textMessage.MessageType);
        Assert.Equal(MessageType.Tool, toolMessage.MessageType);
        Assert.Equal(MessageType.Status, statusMessage.MessageType);
    }
}
