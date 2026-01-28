using MoYuCode.Data;
using MoYuCode.Data.Entities;

namespace MoYuCode.Services.Sessions;

/// <summary>
/// 会话消息仓储，负责消息的持久化操作
/// </summary>
public sealed class SessionMessageRepository
{
    private readonly JsonDataStore _dataStore;
    private readonly ILogger<SessionMessageRepository> _logger;

    public SessionMessageRepository(JsonDataStore dataStore, ILogger<SessionMessageRepository> logger)
    {
        _dataStore = dataStore ?? throw new ArgumentNullException(nameof(dataStore));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// 保存消息
    /// </summary>
    public async Task<SessionMessageEntity> SaveMessageAsync(
        Guid sessionId,
        MessageRole role,
        string content,
        MessageType messageType = MessageType.Text)
    {
        var message = new SessionMessageEntity
        {
            SessionId = sessionId,
            Role = role,
            Content = content,
            MessageType = messageType,
            CreatedAtUtc = DateTimeOffset.UtcNow
        };

        _dataStore.Add(message);
        await _dataStore.SaveDataAsync();

        _logger.LogDebug("Saved message {MessageId} to session {SessionId}", message.Id, sessionId);
        return message;
    }

    /// <summary>
    /// 分页查询会话消息
    /// </summary>
    public (List<SessionMessageEntity> Messages, int Total) GetMessages(Guid sessionId, int skip = 0, int take = 50)
    {
        var messages = _dataStore.GetSessionMessages(sessionId, skip, take);
        var total = _dataStore.GetSessionMessageCount(sessionId);
        return (messages, total);
    }

    /// <summary>
    /// 删除会话的所有消息
    /// </summary>
    public async Task DeleteSessionMessagesAsync(Guid sessionId)
    {
        _dataStore.RemoveSessionMessages(sessionId);
        await _dataStore.SaveDataAsync();
        _logger.LogInformation("Deleted all messages for session {SessionId}", sessionId);
    }

    /// <summary>
    /// 获取会话消息数量
    /// </summary>
    public int GetMessageCount(Guid sessionId)
    {
        return _dataStore.GetSessionMessageCount(sessionId);
    }
}
