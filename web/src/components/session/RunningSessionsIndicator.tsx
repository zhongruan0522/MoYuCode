import { Loader2 } from 'lucide-react';
import type { Session } from '@/hooks/useSessionManager';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { SessionItem } from './SessionItem';

export interface RunningSessionsIndicatorProps {
  runningSessions: Session[];
  onSessionClick: (session: Session) => void;
  className?: string;
}

export function RunningSessionsIndicator({
  runningSessions,
  onSessionClick,
  className,
}: RunningSessionsIndicatorProps) {
  if (runningSessions.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md',
            'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            'hover:bg-blue-500/20 transition-colors',
            className
          )}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="text-xs font-medium">{runningSessions.length} 运行中</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">
          运行中的会话
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {runningSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              onClick={() => onSessionClick(session)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
