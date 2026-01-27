import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/api/client';

export interface Session {
  id: string;
  projectId: string;
  projectName?: string;
  title: string;
  state: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  createdAtUtc: string;
  updatedAtUtc: string;
  completedAtUtc?: string;
  messageCount: number;
}

export interface SessionMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  messageType: 'text' | 'tool' | 'status' | 'artifact' | 'tokenusage';
  createdAtUtc: string;
}

export interface UseSessionManagerOptions {
  projectId?: string;
  autoLoad?: boolean;
}

export interface UseSessionManagerResult {
  sessions: Session[];
  runningSessions: Session[];
  currentSession: Session | null;
  isLoading: boolean;
  error: string | null;
  loadSessions: () => Promise<void>;
  loadRunningSessions: () => Promise<void>;
  createSession: (title?: string) => Promise<Session>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  loadMessages: (sessionId: string, skip?: number, take?: number) => Promise<{ messages: SessionMessage[]; total: number }>;
  setCurrentSession: (session: Session | null) => void;
}

export function useSessionManager(options: UseSessionManagerOptions = {}): UseSessionManagerResult {
  const { projectId, autoLoad = false } = options;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [runningSessions, setRunningSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载项目会话列表
  const loadSessions = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<{ sessions: Session[] }>(`/api/projects/${projectId}/managed-sessions`);
      setSessions(response.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
      console.error('Failed to load sessions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // 加载运行中会话
  const loadRunningSessions = useCallback(async () => {
    try {
      const response = await apiClient.get<{ sessions: Session[] }>('/api/sessions/running');
      setRunningSessions(response.sessions);
    } catch (err) {
      console.error('Failed to load running sessions:', err);
    }
  }, []);

  // 创建新会话
  const createSession = useCallback(async (title?: string): Promise<Session> => {
    if (!projectId) {
      throw new Error('Project ID is required');
    }

    const response = await apiClient.post<Session>('/api/sessions', {
      projectId,
      title,
    });

    setSessions((prev) => [response, ...prev]);
    setCurrentSession(response);
    return response;
  }, [projectId]);

  // 删除会话
  const deleteSession = useCallback(async (sessionId: string) => {
    await apiClient.delete(`/api/sessions/${sessionId}`);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    setRunningSessions((prev) => prev.filter((s) => s.id !== sessionId));

    if (currentSession?.id === sessionId) {
      setCurrentSession(null);
    }
  }, [currentSession]);

  // 更新会话标题
  const updateSessionTitle = useCallback(async (sessionId: string, title: string) => {
    const response = await apiClient.patch<Session>(`/api/sessions/${sessionId}`, { title });
    
    setSessions((prev) => prev.map((s) => s.id === sessionId ? response : s));
    setRunningSessions((prev) => prev.map((s) => s.id === sessionId ? response : s));
    
    if (currentSession?.id === sessionId) {
      setCurrentSession(response);
    }
  }, [currentSession]);

  // 切换当前会话
  const switchSession = useCallback(async (sessionId: string) => {
    if (!projectId) {
      throw new Error('Project ID is required');
    }

    await apiClient.put(`/api/projects/${projectId}/current-session`, {
      sessionId,
    });

    const session = sessions.find((s) => s.id === sessionId) || runningSessions.find((s) => s.id === sessionId);
    if (session) {
      setCurrentSession(session);
    }
  }, [projectId, sessions, runningSessions]);

  // 加载会话消息
  const loadMessages = useCallback(async (sessionId: string, skip = 0, take = 50) => {
    const response = await apiClient.get<{ messages: SessionMessage[]; total: number }>(
      `/api/sessions/${sessionId}/messages?skip=${skip}&take=${take}`
    );
    return response;
  }, []);

  // 自动加载
  useEffect(() => {
    if (autoLoad && projectId) {
      loadSessions();
      loadRunningSessions();
    }
  }, [autoLoad, projectId, loadSessions, loadRunningSessions]);

  return {
    sessions,
    runningSessions,
    currentSession,
    isLoading,
    error,
    loadSessions,
    loadRunningSessions,
    createSession,
    deleteSession,
    updateSessionTitle,
    switchSession,
    loadMessages,
    setCurrentSession,
  };
}
