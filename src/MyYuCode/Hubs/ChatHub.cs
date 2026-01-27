using Microsoft.AspNetCore.SignalR;

namespace MyYuCode.Hubs;

/// <summary>
/// SignalR Hub 用于实时聊天消息推送
/// </summary>
public sealed class ChatHub : Hub
{
    private readonly ILogger<ChatHub> _logger;

    public ChatHub(ILogger<ChatHub> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// 客户端加入会话组
    /// </summary>
    public async Task JoinSession(string sessionId)
    {
        var groupName = GetGroupName(sessionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        _logger.LogInformation("Connection {ConnectionId} joined session {SessionId}", Context.ConnectionId, sessionId);

        // 通知组内其他成员
        await Clients.Group(groupName).SendAsync("UserJoined", Context.ConnectionId);
    }

    /// <summary>
    /// 客户端离开会话组
    /// </summary>
    public async Task LeaveSession(string sessionId)
    {
        var groupName = GetGroupName(sessionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
        _logger.LogInformation("Connection {ConnectionId} left session {SessionId}", Context.ConnectionId, sessionId);

        // 通知组内其他成员
        await Clients.Group(groupName).SendAsync("UserLeft", Context.ConnectionId);
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (exception != null)
        {
            _logger.LogWarning(exception, "Client disconnected with error: {ConnectionId}", Context.ConnectionId);
        }
        else
        {
            _logger.LogInformation("Client disconnected: {ConnectionId}", Context.ConnectionId);
        }
        await base.OnDisconnectedAsync(exception);
    }

    private static string GetGroupName(string sessionId) => $"session-{sessionId}";
}

/// <summary>
/// ChatHub 扩展方法，用于从服务端推送消息
/// </summary>
public static class ChatHubExtensions
{
    /// <summary>
    /// 向会话组广播消息
    /// </summary>
    public static async Task BroadcastToSessionAsync(
        this IHubContext<ChatHub> hubContext,
        string sessionId,
        string eventName,
        object message)
    {
        var groupName = $"session-{sessionId}";
        await hubContext.Clients.Group(groupName).SendAsync(eventName, message);
    }

    /// <summary>
    /// 向会话组广播接收消息事件
    /// </summary>
    public static async Task SendMessageToSessionAsync(
        this IHubContext<ChatHub> hubContext,
        string sessionId,
        object message)
    {
        await hubContext.BroadcastToSessionAsync(sessionId, "ReceiveMessage", message);
    }

    /// <summary>
    /// 向会话组广播状态更新事件
    /// </summary>
    public static async Task SendStatusUpdateToSessionAsync(
        this IHubContext<ChatHub> hubContext,
        string sessionId,
        object status)
    {
        await hubContext.BroadcastToSessionAsync(sessionId, "StatusUpdate", status);
    }
}
