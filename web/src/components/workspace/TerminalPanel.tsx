import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Plus, X, Edit2, Check, RotateCcw } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { TerminalSession, type TerminalSessionHandle } from '@/components/terminal-kit'
import { Input } from '@/components/ui/input'

/**
 * TerminalPanel 组件属性
 */
export interface TerminalPanelProps {
  /** 工作区路径 */
  workspacePath?: string
  /** 自定义类名 */
  className?: string
}

/**
 * TerminalPanel - 终端面板组件
 *
 * 管理多个终端实例，支持：
 * - 创建新终端
 * - 终端标签切换
 * - 关闭终端
 * - 终端重命名
 * - 集成 xterm.js
 */
export function TerminalPanel({ workspacePath, className }: TerminalPanelProps) {
  const terminals = useWorkspaceStore((state) => state.terminals)
  const activeTerminalId = useWorkspaceStore((state) => state.activeTerminalId)
  const createTerminal = useWorkspaceStore((state) => state.createTerminal)
  const closeTerminal = useWorkspaceStore((state) => state.closeTerminal)
  const setActiveTerminal = useWorkspaceStore((state) => state.setActiveTerminal)
  const updateTerminalStatus = useWorkspaceStore((state) => state.updateTerminalStatus)
  const renameTerminal = useWorkspaceStore((state) => state.renameTerminal)

  // 终端会话引用
  const terminalRefs = useRef<Map<string, TerminalSessionHandle>>(new Map())

  // 重命名状态
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  /**
   * 处理创建新终端
   */
  const handleCreateTerminal = useCallback(() => {
    createTerminal(workspacePath || '~')
  }, [createTerminal, workspacePath])

  /**
   * 处理关闭终端
   */
  const handleCloseTerminal = useCallback((e: React.MouseEvent, terminalId: string) => {
    e.stopPropagation()
    const ref = terminalRefs.current.get(terminalId)
    ref?.terminate()
    terminalRefs.current.delete(terminalId)
    closeTerminal(terminalId)
  }, [closeTerminal])

  /**
   * 处理终端状态变化
   */
  const handleStatusChange = useCallback(
    (terminalId: string, status: 'connecting' | 'connected' | 'closed' | 'error') => {
      updateTerminalStatus(terminalId, status)
    },
    [updateTerminalStatus]
  )

  /**
   * 开始重命名
   */
  const startRename = useCallback((e: React.MouseEvent, terminalId: string, currentTitle: string) => {
    e.stopPropagation()
    setRenamingId(terminalId)
    setRenameValue(currentTitle)
  }, [])

  /**
   * 确认重命名
   */
  const confirmRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameTerminal(renamingId, renameValue.trim())
    }
    setRenamingId(null)
    setRenameValue('')
  }, [renamingId, renameValue, renameTerminal])

  /**
   * 取消重命名
   */
  const cancelRename = useCallback(() => {
    setRenamingId(null)
    setRenameValue('')
  }, [])

  /**
   * 重启终端
   */
  const handleRestartTerminal = useCallback((e: React.MouseEvent, terminalId: string) => {
    e.stopPropagation()
    const ref = terminalRefs.current.get(terminalId)
    ref?.restart()
  }, [])

  // 获取当前激活的终端
  const activeTerminal = activeTerminalId
    ? terminals.find((t) => t.id === activeTerminalId)
    : null

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* 终端标签栏 */}
      <div className="flex items-center gap-1 px-2 py-1 bg-muted/20 border-b border-border">
        {terminals.map((terminal) => {
          const isActive = terminal.id === activeTerminalId
          const isRenaming = renamingId === terminal.id

          return (
            <div
              key={terminal.id}
              className={cn(
                'group flex items-center gap-1.5 px-2 py-0.5 text-sm rounded cursor-pointer',
                'transition-colors duration-150',
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              onClick={() => setActiveTerminal(terminal.id)}
            >
              {isRenaming ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename()
                      if (e.key === 'Escape') cancelRename()
                    }}
                    className="h-5 w-24 text-xs px-1"
                    autoFocus
                  />
                  <button
                    className="p-0.5 rounded hover:bg-muted-foreground/20"
                    onClick={confirmRename}
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
                  <span
                    className="truncate max-w-[100px]"
                    onDoubleClick={(e) => startRename(e, terminal.id, terminal.title)}
                  >
                    {terminal.title}
                  </span>
                  
                  {/* 状态指示器 */}
                  {terminal.status === 'connecting' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                  )}
                  {terminal.status === 'error' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  )}

                  {/* 操作按钮 */}
                  <div className={cn(
                    'flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity',
                    isActive && 'opacity-100'
                  )}>
                    <button
                      className="p-0.5 rounded hover:bg-muted-foreground/20"
                      onClick={(e) => startRename(e, terminal.id, terminal.title)}
                      aria-label="重命名"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      className="p-0.5 rounded hover:bg-muted-foreground/20"
                      onClick={(e) => handleRestartTerminal(e, terminal.id)}
                      aria-label="重启"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                    <button
                      className="p-0.5 rounded hover:bg-muted-foreground/20"
                      onClick={(e) => handleCloseTerminal(e, terminal.id)}
                      aria-label={`关闭 ${terminal.title}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}

        {/* 新建终端按钮 */}
        <button
          className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          onClick={handleCreateTerminal}
          aria-label="新建终端"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* 终端内容 */}
      <div className="flex-1 overflow-hidden bg-[#1e1e1e]">
        {activeTerminal ? (
          <TerminalSession
            key={activeTerminal.id}
            ref={(ref) => {
              if (ref) {
                terminalRefs.current.set(activeTerminal.id, ref)
              }
            }}
            id={activeTerminal.id}
            cwd={activeTerminal.cwd}
            className="h-full"
            autoFocus
            onStatusChange={(status) => handleStatusChange(activeTerminal.id, status)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            <button
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              onClick={handleCreateTerminal}
            >
              创建终端
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
