import { useState, useRef, useEffect } from 'react';
import { Loader2, Trash2, MoreHorizontal, Pencil, Check, X } from 'lucide-react';
import type { Session } from '@/hooks/useSessionManager';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface SessionItemProps {
  session: Session;
  isActive?: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onRename?: (newTitle: string) => void;
  className?: string;
}

export function SessionItem({ session, isActive, onClick, onDelete, onRename, className }: SessionItemProps) {
  const isRunning = session.state === 'RUNNING';
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(session.title || '新对话');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditValue(session.title || '新对话');
    setIsEditing(true);
  };

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.title && onRename) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(session.title || '新对话');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200',
        'hover:bg-accent/50',
        isActive ? 'bg-accent text-accent-foreground shadow-sm' : 'text-foreground/80',
        className
      )}
      onClick={isEditing ? undefined : onClick}
    >
      {/* Title or Edit Input */}
      <div className="flex-1 min-w-0 pr-6">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              className="flex-1 text-[13px] bg-background border border-border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-primary"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => { e.stopPropagation(); handleSave(); }}
              className="p-0.5 hover:bg-background/80 rounded text-green-600"
            >
              <Check className="size-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleCancel(); }}
              className="p-0.5 hover:bg-background/80 rounded text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <span className={cn(
            "text-[13px] truncate block leading-snug",
            isActive ? "font-medium" : "font-normal group-hover:text-foreground"
          )}>
            {session.title || '新对话'}
          </span>
        )}
      </div>

      {/* Running Indicator */}
      {isRunning && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3 text-blue-500 animate-spin" />
      )}

      {/* Hover Actions (Desktop) - Only show if not running and not editing */}
      {!isRunning && !isEditing && (isActive || onDelete || onRename) && (
        <div className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1",
          "opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-accent via-accent to-transparent pl-2"
        )}>
          {(onDelete || onRename) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="p-1 hover:bg-background/80 rounded-md text-muted-foreground hover:text-foreground transition-colors">
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                {onRename && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStartEdit(); }}>
                    <Pencil className="mr-2 size-3.5" />
                    <span>重命名</span>
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem 
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-3.5" />
                    <span>删除</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}
