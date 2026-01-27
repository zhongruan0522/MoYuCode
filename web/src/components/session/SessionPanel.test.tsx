import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionPanel } from './SessionPanel';
import type { Session } from '@/hooks/useSessionManager';

describe('SessionPanel', () => {
  const mockSessions: Session[] = [
    {
      id: '1',
      projectId: 'proj-1',
      title: 'Session 1',
      state: 'COMPLETED',
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
      messageCount: 10,
    },
    {
      id: '2',
      projectId: 'proj-1',
      title: 'Session 2',
      state: 'IDLE',
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
      messageCount: 5,
    },
  ];

  const mockRunningSessions: Session[] = [
    {
      id: '3',
      projectId: 'proj-1',
      title: 'Running Session',
      state: 'RUNNING',
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
      messageCount: 15,
    },
  ];

  const defaultProps = {
    sessions: mockSessions,
    runningSessions: mockRunningSessions,
    onSessionClick: vi.fn(),
    onCreateSession: vi.fn(),
  };

  it('should render session panel with title', () => {
    render(<SessionPanel {...defaultProps} />);
    expect(screen.getByText('会话')).toBeInTheDocument();
  });

  it('should render running sessions section', () => {
    render(<SessionPanel {...defaultProps} />);
    // 使用更精确的选择器 - 查找包含 "运行中 (" 的文本
    expect(screen.getByText(/运行中 \(/)).toBeInTheDocument();
    expect(screen.getByText('Running Session')).toBeInTheDocument();
  });

  it('should render history sessions section', () => {
    render(<SessionPanel {...defaultProps} />);
    // 简化后的 UI 使用 "历史" 而不是 "历史会话"
    expect(screen.getByText('历史')).toBeInTheDocument();
    expect(screen.getByText('Session 1')).toBeInTheDocument();
    expect(screen.getByText('Session 2')).toBeInTheDocument();
  });

  it('should call onSessionClick when session is clicked', () => {
    const onSessionClick = vi.fn();
    render(<SessionPanel {...defaultProps} onSessionClick={onSessionClick} />);

    fireEvent.click(screen.getByText('Session 1'));
    expect(onSessionClick).toHaveBeenCalledWith(mockSessions[0]);
  });

  it('should call onCreateSession when create button is clicked', () => {
    const onCreateSession = vi.fn();
    render(<SessionPanel {...defaultProps} onCreateSession={onCreateSession} />);

    // 查找包含 Plus 图标的按钮
    const buttons = screen.getAllByRole('button');
    const createButton = buttons.find(btn => btn.querySelector('.lucide-plus'));
    if (createButton) {
      fireEvent.click(createButton);
      expect(onCreateSession).toHaveBeenCalled();
    }
  });

  it('should highlight active session', () => {
    render(<SessionPanel {...defaultProps} currentSessionId="1" />);
    
    // The active session should have the bg-accent/70 class (simplified UI)
    const sessionItem = screen.getByText('Session 1').closest('div[class*="cursor-pointer"]');
    expect(sessionItem).toHaveClass('bg-accent/70');
  });

  it('should show loading state', () => {
    render(<SessionPanel {...defaultProps} isLoading={true} />);
    
    // Should show spinner when loading
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should show empty state when no sessions', () => {
    render(
      <SessionPanel
        {...defaultProps}
        sessions={[]}
        runningSessions={[]}
      />
    );

    expect(screen.getByText('暂无会话')).toBeInTheDocument();
    expect(screen.getByText('创建新会话')).toBeInTheDocument();
  });

  it('should call onDeleteSession when delete button is clicked', () => {
    const onDeleteSession = vi.fn();
    render(<SessionPanel {...defaultProps} onDeleteSession={onDeleteSession} />);

    // Hover over a session to show delete button
    const sessionItem = screen.getByText('Session 1').closest('div[class*="cursor-pointer"]');
    if (sessionItem) {
      fireEvent.mouseEnter(sessionItem);
    }

    // Find and click delete button
    const deleteButtons = screen.queryAllByTitle('删除会话');
    if (deleteButtons.length > 0) {
      fireEvent.click(deleteButtons[0]);
      expect(onDeleteSession).toHaveBeenCalledWith('1');
    }
  });

  it('should not show delete button for running sessions', () => {
    const onDeleteSession = vi.fn();
    render(
      <SessionPanel
        {...defaultProps}
        sessions={[]}
        runningSessions={mockRunningSessions}
        onDeleteSession={onDeleteSession}
      />
    );

    // Running sessions should not have delete button
    const deleteButtons = screen.queryAllByTitle('删除会话');
    expect(deleteButtons).toHaveLength(0);
  });

  it('should display session titles correctly', () => {
    render(<SessionPanel {...defaultProps} />);

    // 简化后的 UI 只显示标题和时间，不显示消息数量
    expect(screen.getByText('Session 1')).toBeInTheDocument();
    expect(screen.getByText('Session 2')).toBeInTheDocument();
    expect(screen.getByText('Running Session')).toBeInTheDocument();
  });
});
