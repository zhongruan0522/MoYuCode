import { useMemo } from 'react';
import { Plus, MessageSquare, Loader2 } from 'lucide-react';
import type { Session } from '@/hooks/useSessionManager';
import { SessionItem } from './SessionItem';
import { Button } from '@/components/ui/button';

export interface SessionPanelProps {
  sessions: Session[];
  runningSessions: Session[];
  currentSessionId?: string;
  isLoading?: boolean;
  onSessionClick: (session: Session) => void;
  onCreateSession: () => void;
  onDeleteSession?: (sessionId: string) => void;
  onRenameSession?: (sessionId: string, newTitle: string) => void;
}

function getSessionGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const days7 = new Date(today);
  days7.setDate(days7.getDate() - 7);
  const days30 = new Date(today);
  days30.setDate(days30.getDate() - 30);

  if (date >= today) return '今天';
  if (date >= yesterday) return '昨天';
  if (date >= days7) return '最近 7 天';
  if (date >= days30) return '最近 30 天';
  return '更早';
}

export function SessionPanel({
  sessions,
  runningSessions,
  currentSessionId,
  isLoading,
  onSessionClick,
  onCreateSession,
  onDeleteSession,
  onRenameSession,
}: SessionPanelProps) {
  const runningSessionIds = new Set(runningSessions.map((s) => s.id));
  
  const groupedSessions = useMemo(() => {
    const history = sessions.filter((s) => !runningSessionIds.has(s.id) && s.state !== 'RUNNING');
    const groups: Record<string, Session[]> = {};
    
    // Define group order
    const order = ['今天', '昨天', '最近 7 天', '最近 30 天', '更早'];
    
    history.forEach(session => {
      const group = getSessionGroup(session.createdAtUtc);
      if (!groups[group]) groups[group] = [];
      groups[group].push(session);
    });

    return order
      .map(key => ({ title: key, sessions: groups[key] || [] }))
      .filter(group => group.sessions.length > 0);
  }, [sessions, runningSessionIds]);

  return (
    <div className="flex flex-col h-full bg-muted/5 font-sans">
      {/* Sticky New Chat Header */}
      <div className="flex-shrink-0 p-3 pb-2">
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2 h-10 px-3 bg-background hover:bg-muted/50 border-border/40 shadow-sm transition-all text-sm font-medium"
          onClick={onCreateSession}
        >
          <Plus className="size-4 text-muted-foreground" />
          <span>新对话</span>
        </Button>
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar pb-4 px-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground/50" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Running Sessions Group */}
            {runningSessions.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider sticky top-0 bg-muted/5 backdrop-blur-sm z-10">
                  运行中
                </div>
                <div className="space-y-0.5">
                  {runningSessions.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      isActive={session.id === currentSessionId}
                      onClick={() => onSessionClick(session)}
                      onDelete={onDeleteSession ? () => onDeleteSession(session.id) : undefined}
                      onRename={onRenameSession ? (newTitle) => onRenameSession(session.id, newTitle) : undefined}
                      className="border-l-2 border-blue-500/50 bg-blue-500/5 hover:bg-blue-500/10"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* History Groups */}
            {groupedSessions.map((group) => (
              <div key={group.title} className="flex flex-col gap-1">
                <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider sticky top-0 bg-muted/5 backdrop-blur-sm z-10">
                  {group.title}
                </div>
                <div className="space-y-0.5">
                  {group.sessions.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      isActive={session.id === currentSessionId}
                      onClick={() => onSessionClick(session)}
                      onDelete={onDeleteSession ? () => onDeleteSession(session.id) : undefined}
                      onRename={onRenameSession ? (newTitle) => onRenameSession(session.id, newTitle) : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Empty State */}
            {sessions.length === 0 && runningSessions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40 gap-2">
                <div className="size-12 rounded-full bg-muted/20 flex items-center justify-center">
                  <MessageSquare className="size-6" />
                </div>
                <p className="text-xs font-medium">暂无历史记录</p>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* User Profile / Settings (Placeholder for future) */}
      <div className="flex-shrink-0 p-3 border-t border-border/20 mt-auto">
         {/* Could add user profile here later */}
      </div>
    </div>
  );
}

