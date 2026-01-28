import type { MouseEvent as ReactMouseEvent } from 'react'
import type { ProjectDto, ToolStatusDto } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import {
  CheckSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react'

export type ProjectSelectionCardProps = {
  projects: ProjectDto[]
  scanning: boolean
  scanLogs: string[]
  toolStatus: ToolStatusDto | null
  toolLabel: string
  routePath: string
  scanCommandLabel: string
  scanTooltip: string
  onSelectProject: (id: string, event?: ReactMouseEvent<HTMLButtonElement>) => void
  onOpenProjectMenu: (
    project: ProjectDto,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void
  onCreateProject: () => void
  onScanProjects: () => void
  onStopScan: () => void
  onGoInstallTool: () => void
  // Batch selection props
  selectionMode?: boolean
  selectedIds?: Set<string>
  onToggleSelectionMode?: () => void
  onToggleSelect?: (id: string) => void
  onSelectAll?: () => void
  onDeselectAll?: () => void
  onBatchDelete?: () => void
  onBatchPin?: (isPinned: boolean) => void
  batchOperationBusy?: boolean
  // Context menu for batch operations
  onOpenBatchContextMenu?: (event: ReactMouseEvent<HTMLDivElement>, projectId?: string) => void
}

// Task 8.1: Responsive layout for ProjectListPage
export function ProjectSelectionCard({
  projects,
  scanning,
  scanLogs,
  toolStatus,
  toolLabel,
  routePath,
  scanCommandLabel,
  scanTooltip,
  onSelectProject,
  onOpenProjectMenu,
  onCreateProject,
  onScanProjects,
  onStopScan,
  onGoInstallTool,
  // Batch selection props
  selectionMode = false,
  selectedIds = new Set(),
  onToggleSelectionMode,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onBatchDelete,
  onBatchPin,
  batchOperationBusy = false,
  onOpenBatchContextMenu,
}: ProjectSelectionCardProps) {
  const toolInstalled = toolStatus ? toolStatus.installed : null

  return (
    <div className="h-full flex flex-col rounded-lg border bg-card p-3 sm:p-4 animate-in fade-in-0 duration-200">
      <div className="text-sm font-medium">先选择一个项目</div>
      <div className="mt-1 text-xs text-muted-foreground hidden sm:block">
        选择后会打开工作区，并将路由固定为{' '}
        <code className="px-1">{routePath}?projects=id</code>。
      </div>

      {/* Task 8.1: Responsive button layout */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!selectionMode ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCreateProject}
              className="flex-1 sm:flex-none min-w-[100px]"
            >
              <Plus className="size-4" />
              <span className="hidden xs:inline">新建项目</span>
              <span className="xs:hidden">新建</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={scanning || toolInstalled === false}
              onClick={onScanProjects}
              title={scanTooltip}
              className="flex-1 sm:flex-none min-w-[100px]"
            >
              {scanning ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> <span className="hidden sm:inline">扫描中</span>
                </span>
              ) : (
                <>
                  <Search className="size-4" />
                  <span className="hidden xs:inline">扫描项目</span>
                  <span className="xs:hidden">扫描</span>
                </>
              )}
            </Button>

            {projects.length > 0 && onToggleSelectionMode && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onToggleSelectionMode}
                title="批量管理项目"
                className="flex-1 sm:flex-none min-w-[100px]"
              >
                <CheckSquare className="size-4" />
                <span className="hidden xs:inline">批量操作</span>
                <span className="xs:hidden">批量</span>
              </Button>
            )}

            {toolStatus?.version ? (
              <div className="ml-auto text-xs text-muted-foreground hidden sm:block">
                {toolLabel} v{toolStatus.version}
              </div>
            ) : null}
          </>
        ) : (
          /* Batch operation toolbar */
          <div className="flex w-full flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-primary">
                已选 {selectedIds.size} 项
              </span>
              {selectedIds.size > 0 && selectedIds.size < projects.length && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onSelectAll}
                  disabled={batchOperationBusy}
                >
                  <Square className="size-4" />
                  全选
                </Button>
              )}
              {selectedIds.size === projects.length && projects.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onDeselectAll}
                  disabled={batchOperationBusy}
                >
                  <CheckSquare className="size-4" />
                  取消全选
                </Button>
              )}
              {selectedIds.size === 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onSelectAll}
                  disabled={batchOperationBusy}
                >
                  <Square className="size-4" />
                  全选
                </Button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {selectedIds.size > 0 && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onBatchPin?.(true)}
                    disabled={batchOperationBusy}
                    title="批量置顶"
                  >
                    <Pin className="size-4" />
                    <span className="hidden sm:inline">置顶</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onBatchPin?.(false)}
                    disabled={batchOperationBusy}
                    title="批量取消置顶"
                  >
                    <PinOff className="size-4" />
                    <span className="hidden sm:inline">取消置顶</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onBatchDelete}
                    disabled={batchOperationBusy}
                    className="text-destructive hover:bg-destructive/10"
                    title="批量删除"
                  >
                    <Trash2 className="size-4" />
                    <span className="hidden sm:inline">删除</span>
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onToggleSelectionMode}
                disabled={batchOperationBusy}
                title="退出批量操作"
              >
                <X className="size-4" />
                <span className="hidden sm:inline">退出</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {toolInstalled === false ? (
        <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm">
          <div className="font-medium">未检测到 {toolLabel}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            扫描前会执行 <code className="px-1">{scanCommandLabel}</code>；请先安装{' '}
            {toolLabel} CLI。
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={onGoInstallTool}>
              前往安装
            </Button>
          </div>
        </div>
      ) : null}

      {!projects.length ? (
        <div className="mt-4 space-y-3">
          <div className="text-sm text-muted-foreground">
            {scanning ? '正在自动扫描项目…' : '暂无项目。'}
          </div>
          {scanLogs.length ? (
            <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
              {scanLogs.join('\n')}
            </pre>
          ) : null}
          {scanning ? (
            <Button type="button" variant="outline" onClick={onStopScan}>
              停止扫描
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {/* Task 8.1: Responsive grid with more breakpoints */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {projects.map((p) => {
            const isSelected = selectedIds.has(p.id)
            return (
            <div
              key={p.id}
              className={cn(
                'rounded-md border bg-background p-3',
                'transition-[background-color,border-color,box-shadow] duration-200 ease-out',
                'hover:bg-accent/40 hover:border-border hover:shadow-sm',
                // Task 8.1: Better touch targets for mobile
                'min-h-[60px] sm:min-h-0',
                // Selection mode styles
                selectionMode && isSelected && 'border-primary bg-primary/5 ring-1 ring-primary/30',
                selectionMode && 'cursor-pointer',
              )}
              onClick={selectionMode ? () => onToggleSelect?.(p.id) : undefined}
              onContextMenu={(e) => {
                e.preventDefault()
                if (selectionMode) {
                  // Batch mode: auto-select and show batch menu
                  if (!isSelected) {
                    onToggleSelect?.(p.id)
                  }
                  onOpenBatchContextMenu?.(e, p.id)
                } else {
                  // Normal mode: show project menu
                  onOpenProjectMenu(p, e as unknown as ReactMouseEvent<HTMLButtonElement>)
                }
              }}
              onKeyDown={selectionMode ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggleSelect?.(p.id)
                }
              } : undefined}
              role={selectionMode ? 'checkbox' : undefined}
              aria-checked={selectionMode ? isSelected : undefined}
              tabIndex={selectionMode ? 0 : undefined}
            >
              <div className="flex items-start gap-2">
                {selectionMode && (
                  <div className="flex items-center pt-0.5">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect?.(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`选择项目 ${p.name}`}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className={cn(
                    'min-w-0 flex-1 text-left',
                    'transition-transform duration-200 ease-out',
                    'active:scale-[0.99]',
                    // Task 8.3: Better focus styles for accessibility
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm',
                    selectionMode && 'pointer-events-none',
                  )}
                  onClick={(event) => {
                    if (!selectionMode) {
                      onSelectProject(p.id, event)
                    }
                  }}
                  onAuxClick={(event) => {
                    // Handle middle-click (auxiliary button)
                    if (event.button === 1 && !selectionMode) {
                      event.preventDefault()
                      onSelectProject(p.id, event)
                    }
                  }}
                  title={selectionMode ? undefined : `${p.name}\n${p.workspacePath}\n\n提示：Ctrl/Cmd+点击 或 中键点击 在新标签页打开`}
                  aria-label={`打开项目 ${p.name}`}
                  tabIndex={selectionMode ? -1 : 0}
                >
                  <div className="flex items-center gap-1 truncate text-sm font-medium">
                    {p.isPinned ? (
                      <Pin className="size-3 shrink-0 text-muted-foreground" aria-label="已置顶" />
                    ) : null}
                    <span className="truncate">{p.name}</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {p.workspacePath}
                  </div>
                </button>
                {!selectionMode && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0"
                    aria-haspopup="menu"
                    aria-label={`管理项目 ${p.name}`}
                    title="管理"
                    onClick={(event) => onOpenProjectMenu(p, event)}
                  >
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          )})}
          </div>
        </div>
      )}
    </div>
  )
}
