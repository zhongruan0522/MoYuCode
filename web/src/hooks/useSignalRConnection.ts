import { useCallback, useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { getToken } from '@/auth/token';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface UseSignalRConnectionOptions {
  hubUrl: string;
  autoConnect?: boolean;
  maxRetries?: number; // 最大重试次数，默认5次
  onMessage?: (message: unknown) => void;
  onStatusUpdate?: (status: unknown) => void;
  onUserJoined?: (connectionId: string) => void;
  onUserLeft?: (connectionId: string) => void;
}

export interface UseSignalRConnectionResult {
  connection: signalR.HubConnection | null;
  connectionState: ConnectionState;
  retryCount: number; // 当前重试次数
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  manualReconnect: () => Promise<void>; // 手动重连
  joinSession: (sessionId: string) => Promise<void>;
  leaveSession: (sessionId: string) => Promise<void>;
  currentSessionId: string | null;
}

export function useSignalRConnection(options: UseSignalRConnectionOptions): UseSignalRConnectionResult {
  const { hubUrl, autoConnect = false, maxRetries = 5, onMessage, onStatusUpdate, onUserJoined, onUserLeft } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const isConnectingRef = useRef(false);
  const isMountedRef = useRef(true);
  const retryCountRef = useRef(0);

  // 创建连接
  const createConnection = useCallback(() => {
    if (connectionRef.current) {
      return connectionRef.current;
    }

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => getToken() ?? '',
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          // 指数退避重连策略，最多重试 maxRetries 次
          if (retryContext.previousRetryCount < maxRetries) {
            return Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 30000);
          }
          return null; // 停止重连
        },
      })
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // 连接状态变化处理
    connection.onreconnecting(() => {
      if (!isMountedRef.current) return;
      setConnectionState('reconnecting');
      console.log('[SignalR] Reconnecting...');
    });

    connection.onreconnected(() => {
      if (!isMountedRef.current) return;
      setConnectionState('connected');
      retryCountRef.current = 0;
      setRetryCount(0);
      console.log('[SignalR] Reconnected');
      // 重新加入会话
      if (currentSessionId) {
        connection.invoke('JoinSession', currentSessionId).catch(console.error);
      }
    });

    connection.onclose((error) => {
      if (!isMountedRef.current) return;
      // 如果重试次数已达上限，标记为失败状态
      if (retryCountRef.current >= maxRetries) {
        setConnectionState('failed');
        console.log('[SignalR] Connection failed after max retries');
      } else {
        setConnectionState('disconnected');
        console.log('[SignalR] Connection closed', error?.message || '');
      }
    });

    // 消息处理
    connection.on('ReceiveMessage', (message: unknown) => {
      onMessage?.(message);
    });

    connection.on('StatusUpdate', (status: unknown) => {
      onStatusUpdate?.(status);
    });

    connection.on('UserJoined', (connectionId: string) => {
      onUserJoined?.(connectionId);
    });

    connection.on('UserLeft', (connectionId: string) => {
      onUserLeft?.(connectionId);
    });

    connectionRef.current = connection;
    return connection;
  }, [hubUrl, currentSessionId, maxRetries, onMessage, onStatusUpdate, onUserJoined, onUserLeft]);

  // 连接
  const connect = useCallback(async () => {
    if (!isMountedRef.current) return;
    if (isConnectingRef.current) return;
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) return;
    
    // 检查是否超过最大重试次数
    if (retryCountRef.current >= maxRetries) {
      setConnectionState('failed');
      console.log('[SignalR] Max retries reached, manual reconnect required');
      return;
    }

    isConnectingRef.current = true;
    setConnectionState('connecting');

    try {
      const connection = createConnection();
      await connection.start();
      if (!isMountedRef.current) {
        await connection.stop();
        return;
      }
      setConnectionState('connected');
      retryCountRef.current = 0;
      setRetryCount(0);
      console.log('[SignalR] Connected');
    } catch (error) {
      if (!isMountedRef.current) return;
      
      // 处理中止错误（组件卸载时）
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[SignalR] Connection aborted');
        return;
      }
      
      retryCountRef.current++;
      setRetryCount(retryCountRef.current);
      
      if (retryCountRef.current >= maxRetries) {
        setConnectionState('failed');
        console.error(`[SignalR] Connection failed after ${maxRetries} attempts:`, error);
      } else {
        setConnectionState('disconnected');
        console.error(`[SignalR] Connection failed (attempt ${retryCountRef.current}/${maxRetries}):`, error);
        
        // 指数退避重试
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 30000);
        setTimeout(() => {
          if (isMountedRef.current && retryCountRef.current < maxRetries) {
            connect().catch(console.error);
          }
        }, delay);
      }
    } finally {
      isConnectingRef.current = false;
    }
  }, [createConnection, maxRetries]);

  // 手动重连（重置重试计数）
  const manualReconnect = useCallback(async () => {
    // 先清理旧连接
    if (connectionRef.current) {
      try {
        await connectionRef.current.stop();
      } catch {
        // 忽略停止错误
      }
      connectionRef.current = null;
    }
    
    // 重置重试计数
    retryCountRef.current = 0;
    setRetryCount(0);
    setConnectionState('disconnected');
    
    // 重新连接
    await connect();
  }, [connect]);

  // 断开连接
  const disconnect = useCallback(async () => {
    if (connectionRef.current) {
      try {
        await connectionRef.current.stop();
      } catch {
        // 忽略停止错误
      }
      connectionRef.current = null;
      if (isMountedRef.current) {
        setConnectionState('disconnected');
        setCurrentSessionId(null);
      }
    }
  }, []);

  // 加入会话
  const joinSession = useCallback(async (sessionId: string) => {
    const connection = connectionRef.current;
    if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error('Not connected to SignalR hub');
    }

    // 先离开当前会话
    if (currentSessionId && currentSessionId !== sessionId) {
      await connection.invoke('LeaveSession', currentSessionId);
    }

    await connection.invoke('JoinSession', sessionId);
    setCurrentSessionId(sessionId);
    console.log(`[SignalR] Joined session: ${sessionId}`);
  }, [currentSessionId]);

  // 离开会话
  const leaveSession = useCallback(async (sessionId: string) => {
    const connection = connectionRef.current;
    if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
      return;
    }

    await connection.invoke('LeaveSession', sessionId);
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
    }
    console.log(`[SignalR] Left session: ${sessionId}`);
  }, [currentSessionId]);

  // 自动连接
  useEffect(() => {
    isMountedRef.current = true;
    
    if (autoConnect) {
      connect().catch(console.error);
    }

    return () => {
      isMountedRef.current = false;
      disconnect().catch(() => {});
    };
  }, [autoConnect]); // 只依赖 autoConnect，避免重复连接

  return {
    connection: connectionRef.current,
    connectionState,
    retryCount,
    connect,
    disconnect,
    manualReconnect,
    joinSession,
    leaveSession,
    currentSessionId,
  };
}
