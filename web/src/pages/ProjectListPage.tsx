import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { ProjectDto, ToolStatusDto, ToolType } from '@/api/types'
import { ProjectSelectionCard } from '@/pages/code/ProjectSelectionCard'
import { ProjectUpsertModal } from '@/pages/code/ProjectUpsertModal'
import { Modal } from '@/components/Modal'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { MouseEvent as ReactMouseEvent } from 'react'

// Helper functions for localStorage management
function writeStoredProjectId(storageKey: string, id: string): void {
  try {
    localStorage.setItem(storageKey, id)
  } catch {
    // Ignore localStorage errors (e.g., quota exceeded, private browsing)
  }
}

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 1000

type CachedData<T> = {
  data: T
  timestamp: number
}

// In-memory cache for project lists
const projectListCache = new Map<string, CachedData<ProjectDto[]>>()

// Helper to check if cached data is still valid
function isCacheValid<T>(cached: CachedData<T> | undefined): boolean {
  if (!cached) return false
  return Date.now() - cached.timestamp < CACHE_TTL_MS
}

// Helper to get cache key for project list
function getProjectListCacheKey(toolTypes: ToolType[]): string {
  return `projects:${toolTypes.sort().join(',')}`
}

// Export cache invalidation function for use by other components
export function invalidateProjectListCache(toolTypes?: ToolType[]): void {
  if (toolTypes) {
    const cacheKey = getProjectListCacheKey(toolTypes)
    projectListCache.delete(cacheKey)
  } else {
    // Clear all project list caches
    projectListCache.clear()
  }
}

// Task 6.3: Cross-tab synchronization using BroadcastChannel
type ProjectListSyncMessage = {
  type: 'project-list-changed'
  toolTypes: ToolType[]
  action: 'created' | 'updated' | 'deleted' | 'pinned'
  projectId?: string
}

// Create BroadcastChannel for cross-tab communication (if supported)
const projectListChannel: BroadcastChannel | null = (() => {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      return new BroadcastChannel('myyucode:project-list-sync')
    }
  } catch {
    // BroadcastChannel not supported
  }
  return null
})()

// Broadcast project list change to other tabs
export function broadcastProjectListChange(
  toolTypes: ToolType[],
  action: ProjectListSyncMessage['action'],
  projectId?: string
): void {
  if (!projectListChannel) return
  try {
    const message: ProjectListSyncMessage = {
      type: 'project-list-changed',
      toolTypes,
      action,
      projectId,
    }
    projectListChannel.postMessage(message)
  } catch {
    // Ignore broadcast errors
  }
}

type ProjectListPageProps = {
  mode: 'codex' | 'claude'
}

type ProjectListConfig = {
  toolTypes: ToolType[]
  primaryToolType: ToolType
  primaryToolLabel: string
  routePath: string
  installRoute: string
  scanCommandLabel: string
  scanTooltip: string
  selectedProjectStorageKey: string
}

function getProjectListConfig(mode: 'codex' | 'claude'): ProjectListConfig {
  if (mode === 'claude') {
    return {
      toolTypes: ['ClaudeCode'],
      primaryToolType: 'ClaudeCode',
      primaryToolLabel: 'Claude Code',
      routePath: '/claude',
      installRoute: '/claude/tool',
      scanCommandLabel: 'claude --version',
      scanTooltip: '扫描 Claude projects 并创建项目',
      selectedProjectStorageKey: 'myyucode:claude:selected-project-id:v1',
    }
  }

  return {
    toolTypes: ['Codex'],
    primaryToolType: 'Codex',
    primaryToolLabel: 'Codex',
    routePath: '/code',
    installRoute: '/codex',
    scanCommandLabel: 'codex -V',
    scanTooltip: '扫描 Codex sessions 并创建项目',
    selectedProjectStorageKey: 'myyucode:code:selected-project-id:v1',
  }
}

function mergeProjects(a: ProjectDto[], b: ProjectDto[]): ProjectDto[] {
  const map = new Map<string, ProjectDto>()
  for (const p of [...a, ...b]) map.set(p.id, p)
  const merged = Array.from(map.values())
  merged.sort((x, y) => {
    if (x.isPinned !== y.isPinned) return x.isPinned ? -1 : 1
    const ax = Date.parse(x.updatedAtUtc || x.createdAtUtc)
    const ay = Date.parse(y.updatedAtUtc || y.createdAtUtc)
    if (!Number.isNaN(ax) && !Number.isNaN(ay) && ax !== ay) return ay - ax
    return x.name.localeCompare(y.name)
  })
  return merged
}

export function ProjectListPage({ mode }: ProjectListPageProps) {
  const navigate = useNavigate()
  const config = useMemo(() => getProjectListConfig(mode), [mode])

  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  // Task 7.1: Display error messages from redirects (e.g., project not found)
  const [redirectError, setRedirectError] = useState<string | null>(null)

  // Check for redirect error message on mount
  useEffect(() => {
    try {
      const errorMessage = sessionStorage.getItem('projectError')
      if (errorMessage) {
        setRedirectError(errorMessage)
        sessionStorage.removeItem('projectError')
        // Auto-dismiss after 5 seconds
        const timer = setTimeout(() => setRedirectError(null), 5000)
        return () => clearTimeout(timer)
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }, [])

  const [toolStatus, setToolStatus] = useState<ToolStatusDto | null>(null)

  const [scanning, setScanning] = useState(false)
  const [scanLogs, setScanLogs] = useState<string[]>([])
  const scanEventSourceRef = useRef<EventSource | null>(null)
  const autoScanAttemptedRef = useRef(false)

  // Project context menu state
  const [projectMenu, setProjectMenu] = useState<{ x: number; y: number } | null>(null)
  const [projectMenuTarget, setProjectMenuTarget] = useState<ProjectDto | null>(null)

  // Project upsert (create/edit) modal state
  const [upsertOpen, setUpsertOpen] = useState(false)
  const [upsertMode, setUpsertMode] = useState<'create' | 'edit'>('create')
  const [upsertTarget, setUpsertTarget] = useState<ProjectDto | null>(null)

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<ProjectDto | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProjectDto | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Batch selection state
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchOperationBusy, setBatchOperationBusy] = useState(false)
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false)
  const [batchDeleteError, setBatchDeleteError] = useState<string | null>(null)

  // Batch context menu state
  const [batchMenu, setBatchMenu] = useState<{ x: number; y: number } | null>(null)

  // Close batch context menu
  const closeBatchMenu = useCallback(() => {
    setBatchMenu(null)
  }, [])

  // Close project context menu
  const closeProjectMenu = useCallback(() => {
    setProjectMenu(null)
    setProjectMenuTarget(null)
  }, [])

  // Helper to fetch projects with retry logic
  const fetchProjectsWithRetry = useCallback(
    async (attempt = 0): Promise<ProjectDto[]> => {
      try {
        const lists = await Promise.all(config.toolTypes.map((t) => api.projects.list(t)))
        const merged = lists.reduce<ProjectDto[]>(
          (acc, cur) => mergeProjects(acc, cur),
          [],
        )
        return merged
      } catch (e) {
        if (attempt < MAX_RETRY_ATTEMPTS - 1) {
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)))
          return fetchProjectsWithRetry(attempt + 1)
        }
        throw e
      }
    },
    [config.toolTypes],
  )

  const loadProjects = useCallback(
    async (opts?: { forceRefresh?: boolean }) => {
      const forceRefresh = opts?.forceRefresh ?? false
      const cacheKey = getProjectListCacheKey(config.toolTypes)

      // Check cache first unless force refresh is requested
      if (!forceRefresh) {
        const cached = projectListCache.get(cacheKey)
        if (cached && isCacheValid(cached)) {
          setProjects(cached.data)
          setInitialLoadDone(true)
          setError(null)
          return
        }
      }

      setLoading(true)
      setError(null)
      setRetryCount(0)

      try {
        const merged = await fetchProjectsWithRetry()
        
        // Update cache
        projectListCache.set(cacheKey, {
          data: merged,
          timestamp: Date.now(),
        })

        setProjects(merged)
        setRetryCount(0)
      } catch (e) {
        const errorMessage = (e as Error).message
        setError(errorMessage)
        setRetryCount((prev) => prev + 1)
      } finally {
        setLoading(false)
        setInitialLoadDone(true)
      }
    },
    [config.toolTypes, fetchProjectsWithRetry],
  )

  const loadToolStatus = useCallback(async (): Promise<ToolStatusDto | null> => {
    try {
      const toolKey = mode === 'claude' ? 'claude' : 'codex'
      const status = await api.tools.status(toolKey)
      setToolStatus(status)
      return status
    } catch (e) {
      setError((e as Error).message)
      setToolStatus(null)
      return null
    }
  }, [mode])

  const appendScanLog = useCallback((line: string) => {
    setScanLogs((prev) => {
      const next = [...prev, line]
      if (next.length > 200) next.splice(0, next.length - 200)
      return next
    })
  }, [])

  const stopScan = useCallback(() => {
    scanEventSourceRef.current?.close()
    scanEventSourceRef.current = null
    setScanning(false)
  }, [])

  const startScan = useCallback(
    async (opts?: { force?: boolean }) => {
      if (scanning) return
      const force = Boolean(opts?.force)
      if (!force) {
        if (!initialLoadDone) return
        if (autoScanAttemptedRef.current) return
        if (projects.length) return
      }

      autoScanAttemptedRef.current = true
      setScanLogs([])
      setScanning(true)

      scanEventSourceRef.current?.close()
      scanEventSourceRef.current = null

      appendScanLog(`执行：${config.scanCommandLabel}`)
      const status = await loadToolStatus()
      if (!status?.installed) {
        appendScanLog(
          `未检测到 ${config.primaryToolLabel} CLI：请先安装 ${config.primaryToolLabel}，然后重试。`,
        )
        setScanning(false)
        return
      }

      appendScanLog(`${config.primaryToolLabel} 版本：${status.version ?? '—'}`)

      const eventSource = api.projects.scanCodexSessions(config.primaryToolType)
      scanEventSourceRef.current = eventSource

      eventSource.addEventListener('log', (e) => {
        appendScanLog((e as MessageEvent).data as string)
      })

      eventSource.addEventListener('done', (e) => {
        const raw = (e as MessageEvent).data as string
        appendScanLog(raw ? `完成：${raw}` : '完成：扫描已结束。')
        eventSource.close()
        scanEventSourceRef.current = null
        setScanning(false)
        // Force refresh after scan to get new projects
        void loadProjects({ forceRefresh: true })
      })

      eventSource.onerror = () => {
        appendScanLog('连接已中断（可能已完成或服务器异常）。')
        eventSource.close()
        scanEventSourceRef.current = null
        setScanning(false)
      }
    },
    [
      appendScanLog,
      config.primaryToolLabel,
      config.primaryToolType,
      config.scanCommandLabel,
      initialLoadDone,
      loadProjects,
      loadToolStatus,
      projects.length,
      scanning,
    ],
  )

  // Load projects and tool status on mount
  useEffect(() => {
    void loadProjects()
    void loadToolStatus()
    return () => {
      scanEventSourceRef.current?.close()
      scanEventSourceRef.current = null
    }
  }, [loadProjects, loadToolStatus])

  // Task 6.3: Listen for cross-tab synchronization messages
  useEffect(() => {
    if (!projectListChannel) return

    const handleMessage = (event: MessageEvent<ProjectListSyncMessage>) => {
      const message = event.data
      if (message?.type !== 'project-list-changed') return

      // Check if this message is relevant to our tool types
      const relevantToolTypes = message.toolTypes.filter((t) =>
        config.toolTypes.includes(t)
      )
      if (relevantToolTypes.length === 0) return

      // Invalidate cache and reload projects
      invalidateProjectListCache(config.toolTypes)
      void loadProjects({ forceRefresh: true })
    }

    projectListChannel.addEventListener('message', handleMessage)
    return () => {
      projectListChannel.removeEventListener('message', handleMessage)
    }
  }, [config.toolTypes, loadProjects])

  // Auto-scan if no projects exist
  useEffect(() => {
    void startScan()
  }, [startScan])

  const selectProject = useCallback(
    (id: string, event?: ReactMouseEvent<HTMLButtonElement>) => {
      // Update localStorage with selected project ID
      writeStoredProjectId(config.selectedProjectStorageKey, id)

      // Check if user wants to open in new tab
      // Ctrl/Cmd+Click or middle-click (button === 1)
      const openInNewTab =
        event &&
        (event.ctrlKey || event.metaKey || (event.button === 1))

      const targetUrl = `/projects/${id}`

      if (openInNewTab) {
        // Open in new tab
        window.open(targetUrl, '_blank', 'noopener,noreferrer')
      } else {
        // Navigate in current tab
        navigate(targetUrl)
      }
    },
    [config.selectedProjectStorageKey, navigate],
  )

  const openProjectMenu = useCallback(
    (project: ProjectDto, event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (typeof window === 'undefined') return
      const menuWidth = 220
      const menuHeight = 220
      const x = Math.min(event.clientX, Math.max(0, window.innerWidth - menuWidth))
      const y = Math.min(event.clientY, Math.max(0, window.innerHeight - menuHeight))
      setProjectMenuTarget(project)
      setProjectMenu({ x, y })
    },
    [],
  )

  const openBatchContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, _projectId?: string) => {
      event.preventDefault()
      event.stopPropagation()

      if (typeof window === 'undefined') return
      if (selectedIds.size === 0) return

      const menuWidth = 200
      const menuHeight = 180
      const x = Math.min(event.clientX, Math.max(0, window.innerWidth - menuWidth))
      const y = Math.min(event.clientY, Math.max(0, window.innerHeight - menuHeight))
      setBatchMenu({ x, y })
    },
    [selectedIds.size],
  )

  const openCreateProject = useCallback(() => {
    closeProjectMenu()
    setUpsertMode('create')
    setUpsertTarget(null)
    setUpsertOpen(true)
  }, [closeProjectMenu])

  const openEdit = useCallback((project: ProjectDto) => {
    closeProjectMenu()
    setUpsertMode('edit')
    setUpsertTarget(project)
    setUpsertOpen(true)
  }, [closeProjectMenu])

  const openRename = useCallback(
    (project: ProjectDto) => {
      setRenameTarget(project)
      setRenameDraft(project.name)
      setRenameError(null)
      setRenameBusy(false)
      setRenameOpen(true)
      closeProjectMenu()
    },
    [closeProjectMenu],
  )

  const submitRename = useCallback(async () => {
    if (!renameTarget) return
    const name = renameDraft.trim()
    if (!name) {
      setRenameError('名称不能为空')
      return
    }

    if (name === renameTarget.name) {
      setRenameOpen(false)
      setRenameTarget(null)
      return
    }

    setRenameBusy(true)
    setRenameError(null)
    try {
      await api.projects.update(renameTarget.id, {
        toolType: renameTarget.toolType,
        name,
        workspacePath: renameTarget.workspacePath,
        providerId: renameTarget.providerId,
        model: renameTarget.model,
      })
      setRenameOpen(false)
      setRenameTarget(null)
      // Invalidate cache and reload
      invalidateProjectListCache(config.toolTypes)
      await loadProjects({ forceRefresh: true })
      // Task 6.3: Broadcast change to other tabs
      broadcastProjectListChange(config.toolTypes, 'updated', renameTarget.id)
    } catch (e) {
      setRenameError((e as Error).message)
    } finally {
      setRenameBusy(false)
    }
  }, [config.toolTypes, loadProjects, renameDraft, renameTarget])

  const openDelete = useCallback((project: ProjectDto) => {
    setDeleteTarget(project)
    setDeleteError(null)
    setDeleteBusy(false)
    setDeleteDialogOpen(true)
    closeProjectMenu()
  }, [closeProjectMenu])

  // Task 6.2: Optimistic UI update for delete
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    setDeleteError(null)

    // Store previous state for rollback
    const previousProjects = [...projects]
    const targetId = deleteTarget.id

    // Optimistically remove from UI
    setProjects((prev) => prev.filter((p) => p.id !== targetId))
    setDeleteDialogOpen(false)
    setDeleteTarget(null)

    try {
      await api.projects.delete(targetId)
      // Invalidate cache to ensure consistency
      invalidateProjectListCache(config.toolTypes)
      // Task 6.3: Broadcast change to other tabs
      broadcastProjectListChange(config.toolTypes, 'deleted', targetId)
    } catch (e) {
      // Rollback on error
      setProjects(previousProjects)
      setDeleteError((e as Error).message)
      // Re-open dialog to show error
      setDeleteDialogOpen(true)
      setDeleteTarget(previousProjects.find((p) => p.id === targetId) ?? null)
    } finally {
      setDeleteBusy(false)
    }
  }, [config.toolTypes, deleteTarget, projects])

  // Task 6.2: Optimistic UI update for pin/unpin
  const updateProjectPinned = useCallback(
    async (project: ProjectDto, isPinned: boolean) => {
      closeProjectMenu()

      // Optimistically update the UI immediately
      const previousProjects = [...projects]
      setProjects((prev) => {
        const updated = prev.map((p) =>
          p.id === project.id ? { ...p, isPinned } : p
        )
        // Re-sort to move pinned items to top
        updated.sort((x, y) => {
          if (x.isPinned !== y.isPinned) return x.isPinned ? -1 : 1
          const ax = Date.parse(x.updatedAtUtc || x.createdAtUtc)
          const ay = Date.parse(y.updatedAtUtc || y.createdAtUtc)
          if (!Number.isNaN(ax) && !Number.isNaN(ay) && ax !== ay) return ay - ax
          return x.name.localeCompare(y.name)
        })
        return updated
      })

      try {
        await api.projects.updatePin(project.id, { isPinned })
        // Invalidate cache to ensure consistency on next load
        invalidateProjectListCache(config.toolTypes)
        // Task 6.3: Broadcast change to other tabs
        broadcastProjectListChange(config.toolTypes, 'pinned', project.id)
      } catch (e) {
        // Rollback on error
        setProjects(previousProjects)
        setError((e as Error).message)
      }
    },
    [closeProjectMenu, config.toolTypes, projects],
  )

  // Close project menu on escape or scroll
  useEffect(() => {
    if (!projectMenu) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeProjectMenu()
    }

    const onScroll = () => closeProjectMenu()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [closeProjectMenu, projectMenu])

  // Close batch menu on escape or scroll
  useEffect(() => {
    if (!batchMenu) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeBatchMenu()
    }

    const onScroll = () => closeBatchMenu()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [closeBatchMenu, batchMenu])

  // Exit selection mode on Escape
  useEffect(() => {
    if (!selectionMode) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !batchDeleteDialogOpen && !batchMenu) {
        setSelectionMode(false)
        setSelectedIds(new Set())
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectionMode, batchDeleteDialogOpen, batchMenu])

  // Batch selection handlers
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedIds(new Set())
      }
      return !prev
    })
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(projects.map((p) => p.id)))
  }, [projects])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const openBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return
    setBatchDeleteError(null)
    setBatchDeleteDialogOpen(true)
  }, [selectedIds.size])

  const confirmBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    setBatchOperationBusy(true)
    setBatchDeleteError(null)

    const idsToDelete = Array.from(selectedIds)
    const previousProjects = [...projects]

    // Optimistically remove from UI
    setProjects((prev) => prev.filter((p) => !selectedIds.has(p.id)))
    setBatchDeleteDialogOpen(false)

    try {
      await Promise.all(idsToDelete.map((id) => api.projects.delete(id)))
      setSelectedIds(new Set())
      setSelectionMode(false)
      invalidateProjectListCache(config.toolTypes)
      broadcastProjectListChange(config.toolTypes, 'deleted')
    } catch (e) {
      setProjects(previousProjects)
      setBatchDeleteError((e as Error).message)
      setBatchDeleteDialogOpen(true)
    } finally {
      setBatchOperationBusy(false)
    }
  }, [config.toolTypes, projects, selectedIds])

  const batchUpdatePin = useCallback(
    async (isPinned: boolean) => {
      if (selectedIds.size === 0) return
      setBatchOperationBusy(true)

      const idsToUpdate = Array.from(selectedIds)
      const previousProjects = [...projects]

      setProjects((prev) => {
        const updated = prev.map((p) =>
          selectedIds.has(p.id) ? { ...p, isPinned } : p
        )
        updated.sort((x, y) => {
          if (x.isPinned !== y.isPinned) return x.isPinned ? -1 : 1
          const ax = Date.parse(x.updatedAtUtc || x.createdAtUtc)
          const ay = Date.parse(y.updatedAtUtc || y.createdAtUtc)
          if (!Number.isNaN(ax) && !Number.isNaN(ay) && ax !== ay) return ay - ax
          return x.name.localeCompare(y.name)
        })
        return updated
      })

      try {
        await Promise.all(
          idsToUpdate.map((id) => api.projects.updatePin(id, { isPinned }))
        )
        setSelectedIds(new Set())
        setSelectionMode(false)
        invalidateProjectListCache(config.toolTypes)
        broadcastProjectListChange(config.toolTypes, 'pinned')
      } catch (e) {
        setProjects(previousProjects)
        setError((e as Error).message)
      } finally {
        setBatchOperationBusy(false)
      }
    },
    [config.toolTypes, projects, selectedIds],
  )

  const handleScanProjects = useCallback(() => {
    void startScan({ force: true })
  }, [startScan])

  const handleGoInstallTool = useCallback(() => {
    navigate(config.installRoute)
  }, [config.installRoute, navigate])

  if (loading && !initialLoadDone) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">加载项目中...</div>
      </div>
    )
  }

  if (error && !projects.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md space-y-3 text-center">
          <div className="text-sm font-medium text-destructive">加载失败</div>
          <div className="text-xs text-muted-foreground">{error}</div>
          {retryCount > 0 && (
            <div className="text-xs text-muted-foreground">
              已重试 {retryCount} 次
            </div>
          )}
          <button
            type="button"
            onClick={() => void loadProjects({ forceRefresh: true })}
            className="text-xs text-primary hover:underline"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden">
      {/* Task 7.1: Display redirect error message (e.g., project not found) */}
      {redirectError && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-amber-600 dark:text-amber-400">{redirectError}</span>
          </div>
          <button
            type="button"
            className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
            onClick={() => setRedirectError(null)}
            aria-label="关闭"
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>
      )}

      <ProjectSelectionCard
        projects={projects}
        scanning={scanning}
        scanLogs={scanLogs}
        toolStatus={toolStatus}
        toolLabel={config.primaryToolLabel}
        routePath={config.routePath}
        scanCommandLabel={config.scanCommandLabel}
        scanTooltip={config.scanTooltip}
        onSelectProject={selectProject}
        onOpenProjectMenu={openProjectMenu}
        onCreateProject={openCreateProject}
        onScanProjects={handleScanProjects}
        onStopScan={stopScan}
        onGoInstallTool={handleGoInstallTool}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelectionMode={toggleSelectionMode}
        onToggleSelect={toggleSelect}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
        onBatchDelete={openBatchDelete}
        onBatchPin={batchUpdatePin}
        batchOperationBusy={batchOperationBusy}
        onOpenBatchContextMenu={openBatchContextMenu}
      />

      {/* Project context menu */}
      {projectMenu && projectMenuTarget && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-50"
              onMouseDown={closeProjectMenu}
              onContextMenu={(e) => {
                e.preventDefault()
                closeProjectMenu()
              }}
              role="presentation"
            >
              <div
                className="fixed min-w-[200px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 duration-200 ease-out"
                style={{ left: projectMenu.x, top: projectMenu.y }}
                onMouseDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
                role="menu"
              >
                <div className="px-3 py-2 text-xs text-muted-foreground truncate">
                  {projectMenuTarget.name}
                </div>
                <div className="h-px bg-border" />
                <button
                  type="button"
                  className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => openEdit(projectMenuTarget)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => openRename(projectMenuTarget)}
                >
                  重命名
                </button>
                <button
                  type="button"
                  className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => {
                    void updateProjectPinned(
                      projectMenuTarget,
                      !projectMenuTarget.isPinned,
                    )
                  }}
                >
                  {projectMenuTarget.isPinned ? '取消置顶' : '置顶项目'}
                </button>
                <div className="h-px bg-border" />
                <button
                  type="button"
                  className="flex w-full items-center px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  onClick={() => openDelete(projectMenuTarget)}
                >
                  删除
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Batch context menu */}
      {batchMenu && selectionMode && selectedIds.size > 0 && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-50"
              onMouseDown={closeBatchMenu}
              onContextMenu={(e) => {
                e.preventDefault()
                closeBatchMenu()
              }}
              role="presentation"
            >
              <div
                className="fixed min-w-[180px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 duration-200 ease-out"
                style={{ left: batchMenu.x, top: batchMenu.y }}
                onMouseDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
                role="menu"
              >
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  已选 {selectedIds.size} 个项目
                </div>
                <div className="h-px bg-border" />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  disabled={batchOperationBusy}
                  onClick={() => {
                    closeBatchMenu()
                    selectAll()
                  }}
                >
                  全选
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  disabled={batchOperationBusy}
                  onClick={() => {
                    closeBatchMenu()
                    deselectAll()
                  }}
                >
                  取消全选
                </button>
                <div className="h-px bg-border" />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  disabled={batchOperationBusy}
                  onClick={() => {
                    closeBatchMenu()
                    void batchUpdatePin(true)
                  }}
                >
                  批量置顶
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  disabled={batchOperationBusy}
                  onClick={() => {
                    closeBatchMenu()
                    void batchUpdatePin(false)
                  }}
                >
                  批量取消置顶
                </button>
                <div className="h-px bg-border" />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  disabled={batchOperationBusy}
                  onClick={() => {
                    closeBatchMenu()
                    openBatchDelete()
                  }}
                >
                  批量删除
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Project create/edit modal */}
      <ProjectUpsertModal
        open={upsertOpen}
        mode={upsertMode}
        project={upsertMode === 'edit' ? upsertTarget : null}
        defaultToolType={config.primaryToolType}
        allowedToolTypes={config.toolTypes}
        onClose={() => {
          setUpsertOpen(false)
          setUpsertTarget(null)
        }}
        onSaved={(project) => {
          setUpsertOpen(false)
          setUpsertTarget(null)
          // Invalidate cache and reload, then navigate to the new project
          invalidateProjectListCache(config.toolTypes)
          // Task 6.3: Broadcast change to other tabs
          broadcastProjectListChange(
            config.toolTypes,
            upsertMode === 'create' ? 'created' : 'updated',
            project.id
          )
          void loadProjects({ forceRefresh: true }).then(() => {
            selectProject(project.id)
          })
        }}
      />

      {/* Rename modal */}
      <Modal
        open={renameOpen}
        title="重命名项目"
        onClose={() => {
          if (renameBusy) return
          setRenameOpen(false)
          setRenameTarget(null)
          setRenameDraft('')
          setRenameError(null)
        }}
      >
        <div className="space-y-3">
          <Input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            autoFocus
            disabled={renameBusy}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submitRename()
              }
            }}
          />
          {renameError ? <div className="text-sm text-destructive">{renameError}</div> : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={renameBusy}
              onClick={() => {
                if (renameBusy) return
                setRenameOpen(false)
                setRenameTarget(null)
                setRenameDraft('')
                setRenameError(null)
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={renameBusy || !renameDraft.trim()}
              onClick={() => void submitRename()}
            >
              保存
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setDeleteDialogOpen(true)
            return
          }
          if (deleteBusy) return
          setDeleteDialogOpen(false)
          setDeleteTarget(null)
          setDeleteError(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除项目</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除"{deleteTarget?.name ?? ''}"吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <div className="text-sm text-destructive">{deleteError}</div> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch delete confirmation dialog */}
      <AlertDialog
        open={batchDeleteDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setBatchDeleteDialogOpen(true)
            return
          }
          if (batchOperationBusy) return
          setBatchDeleteDialogOpen(false)
          setBatchDeleteError(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>批量删除项目</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除选中的 {selectedIds.size} 个项目吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {batchDeleteError ? (
            <div className="text-sm text-destructive">{batchDeleteError}</div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchOperationBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={batchOperationBusy}
              onClick={(e) => {
                e.preventDefault()
                void confirmBatchDelete()
              }}
            >
              删除 {selectedIds.size} 个项目
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
