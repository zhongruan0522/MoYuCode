import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSignalRConnection } from './useSignalRConnection';

// 创建 mock connection
const createMockConnection = () => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  invoke: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  onreconnecting: vi.fn(),
  onreconnected: vi.fn(),
  onclose: vi.fn(),
  state: 0,
});

let mockConnection = createMockConnection();

// Mock SignalR - 使用 class 语法
vi.mock('@microsoft/signalr', () => {
  // 使用 class 来正确支持 new 关键字
  class MockHubConnectionBuilder {
    withUrl() { return this; }
    withAutomaticReconnect() { return this; }
    configureLogging() { return this; }
    build() { return mockConnection; }
  }

  return {
    HubConnectionBuilder: MockHubConnectionBuilder,
    HubConnectionState: {
      Disconnected: 0,
      Connecting: 1,
      Connected: 2,
      Disconnecting: 3,
      Reconnecting: 4,
    },
    LogLevel: {
      Information: 2,
      Warning: 3,
    },
  };
});

describe('useSignalRConnection', () => {
  const hubUrl = '/api/chat';

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnection = createMockConnection();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with disconnected state', () => {
    const { result } = renderHook(() =>
      useSignalRConnection({ hubUrl })
    );

    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.currentSessionId).toBeNull();
    expect(result.current.retryCount).toBe(0);
  });

  it('should connect when connect is called', async () => {
    mockConnection.start.mockResolvedValueOnce(undefined);
    mockConnection.state = 2; // Connected

    const { result } = renderHook(() =>
      useSignalRConnection({ hubUrl })
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(mockConnection.start).toHaveBeenCalled();
    expect(result.current.connectionState).toBe('connected');
  });

  it('should auto-connect when autoConnect is true', async () => {
    mockConnection.start.mockResolvedValueOnce(undefined);

    renderHook(() =>
      useSignalRConnection({ hubUrl, autoConnect: true })
    );

    await waitFor(() => {
      expect(mockConnection.start).toHaveBeenCalled();
    });
  });

  it('should register message handlers on connection creation', async () => {
    mockConnection.start.mockResolvedValueOnce(undefined);
    const onMessage = vi.fn();
    const onStatusUpdate = vi.fn();

    const { result } = renderHook(() =>
      useSignalRConnection({
        hubUrl,
        onMessage,
        onStatusUpdate,
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    // 验证 on 方法被调用来注册处理器
    expect(mockConnection.on).toHaveBeenCalledWith('ReceiveMessage', expect.any(Function));
    expect(mockConnection.on).toHaveBeenCalledWith('StatusUpdate', expect.any(Function));
  });

  it('should handle disconnect', async () => {
    mockConnection.start.mockResolvedValueOnce(undefined);
    mockConnection.stop.mockResolvedValueOnce(undefined);
    mockConnection.state = 2;

    const { result } = renderHook(() =>
      useSignalRConnection({ hubUrl })
    );

    await act(async () => {
      await result.current.connect();
    });

    await act(async () => {
      await result.current.disconnect();
    });

    expect(mockConnection.stop).toHaveBeenCalled();
    expect(result.current.connectionState).toBe('disconnected');
  });

  it('should join session when connected', async () => {
    mockConnection.start.mockResolvedValueOnce(undefined);
    mockConnection.invoke.mockResolvedValueOnce(undefined);
    mockConnection.state = 2;

    const { result } = renderHook(() =>
      useSignalRConnection({ hubUrl })
    );

    await act(async () => {
      await result.current.connect();
    });

    await act(async () => {
      await result.current.joinSession('session-123');
    });

    // 验证 invoke 被正确调用
    expect(mockConnection.invoke).toHaveBeenCalledWith('JoinSession', 'session-123');
  });

  it('should leave session when called', async () => {
    mockConnection.start.mockResolvedValueOnce(undefined);
    mockConnection.invoke.mockResolvedValue(undefined);
    mockConnection.state = 2;

    const { result } = renderHook(() =>
      useSignalRConnection({ hubUrl })
    );

    await act(async () => {
      await result.current.connect();
    });

    // 验证 leaveSession 方法存在且可调用
    expect(typeof result.current.leaveSession).toBe('function');
    
    // 调用 leaveSession 不应该抛出错误
    await act(async () => {
      await result.current.leaveSession('session-123');
    });
  });

  it('should throw error when joining session without connection', async () => {
    const { result } = renderHook(() =>
      useSignalRConnection({ hubUrl })
    );

    await expect(result.current.joinSession('session-123')).rejects.toThrow(
      'Not connected to SignalR hub'
    );
  });

  it('should expose manualReconnect function', async () => {
    mockConnection.start.mockResolvedValueOnce(undefined);
    mockConnection.state = 2;

    const { result } = renderHook(() =>
      useSignalRConnection({ hubUrl })
    );

    expect(typeof result.current.manualReconnect).toBe('function');
  });

  it('should reset retry count on manual reconnect', async () => {
    mockConnection.start.mockResolvedValueOnce(undefined);
    mockConnection.stop.mockResolvedValueOnce(undefined);
    mockConnection.state = 2;

    const { result } = renderHook(() =>
      useSignalRConnection({ hubUrl, maxRetries: 3 })
    );

    await act(async () => {
      await result.current.manualReconnect();
    });

    expect(result.current.retryCount).toBe(0);
  });
});