import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api, formatUtc } from '@/api/client'
import type {
  CodexDailyTokenUsageDto,
  GitStatusResponse,
  ProjectDto,
  ProjectSessionDto,
  SessionTokenUsageDto,
} from '@/api/types'
import { cn } from '@/lib/utils'
import { getVscodeFileIconUrl } from '@/lib/vscodeFileIcons'
import { ShikiCode } from '@/components/ShikiCode'
import { MonacoCode } from '@/components/MonacoCode'
import { TokenUsageBar, TokenUsageDailyChart } from '@/components/CodexSessionViz'
import { ProjectFileManager } from '@/components/project-workspace/ProjectFileManager'
import { ProjectChat } from '@/components/project-workspace/ProjectChat'
import { TerminalView, type TerminalViewHandle } from '@/components/terminal-kit'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  FileText,
  Folder,
  PanelRightClose,
  PanelRightOpen,
  Terminal,
  X,
} from 'lucide-react'

type WorkspacePanelId = 'project-summary'

type WorkspaceView =
  | { kind: 'empty' }
  | { kind: 'file'; path: string }
  | { kind: 'diff'; file: string }
  | { kind: 'terminal' }
  | { kind: 'output' }
  | { kind: 'panel'; panelId: WorkspacePanelId }

type WorkspaceTab =
  | { kind: 'file'; path: string }
  | { kind: 'diff'; file: string }
  | { kind: 'panel'; panelId: WorkspacePanelId }

type FilePreview = {
  loading: boolean
  error: string | null
  content: string
  truncated: boolean
  isBinary: boolean
}

type DiffPreview = {
  loading: boolean
  error: string | null
  diff: string
  truncated: boolean
}

function getBaseName(fullPath: string): string {
  const normalized = fullPath.replace(/[\\/]+$/, '')
  const lastSeparator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (lastSeparator < 0) return normalized
  const base = normalized.slice(lastSeparator + 1)
  return base || normalized
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getTabKey(tab: WorkspaceTab): string {
  switch (tab.kind) {
    case 'file':
      return `file:${tab.path}`
    case 'diff':
      return `diff:${tab.file}`
    case 'panel':
      return `panel:${tab.panelId}`
  }
}

export type ProjectWorkspaceHandle = {
  openFile: (path: string) => void
  openProjectSummary: () => void
  openTerminal: (opts?: { path?: string; focus?: boolean }) => void
}

type ProjectWorkspacePageProps = {
  projectId?: string
}

function formatDurationMs(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function sumSessionTokens(s: ProjectSessionDto): number {
  return (
    (s.tokenUsage?.inputTokens ?? 0) +
    (s.tokenUsage?.cachedInputTokens ?? 0) +
    (s.tokenUsage?.outputTokens ?? 0) +
    (s.tokenUsage?.reasoningOutputTokens ?? 0)
  )
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'

  const abs = Math.abs(value)
  if (abs < 1000) return value.toLocaleString()

  try {
    const fmt = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    })
    return fmt.format(value)
  } catch {
    const sign = value < 0 ? '-' : ''

    const stripTrailingZero = (raw: string) =>
      raw.endsWith('.0') ? raw.slice(0, -2) : raw

    if (abs < 1_000_000) {
      const n = abs / 1000
      return `${sign}${stripTrailingZero(n.toFixed(1))}K`
    }

    if (abs < 1_000_000_000) {
      const n = abs / 1_000_000
      return `${sign}${stripTrailingZero(n.toFixed(1))}M`
    }

    const n = abs / 1_000_000_000
    return `${sign}${stripTrailingZero(n.toFixed(1))}B`
  }
}

function formatLocalYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function tryGetLocalDayKey(iso: string | null | undefined): string | null {
  const raw = (iso ?? '').trim()
  if (!raw) return null
  const t = Date.parse(raw)
  if (!Number.isFinite(t)) return null
  return formatLocalYmd(new Date(t))
}

function emptyTokenUsage(): SessionTokenUsageDto {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  }
}

function ProjectSummaryPanel({ project }: { project: ProjectDto }) {
  const workspacePath = project.workspacePath.trim()

  const [sessions, setSessions] = useState<ProjectSessionDto[] | null>(null)
  const [hasGitRepo, setHasGitRepo] = useState<boolean | null>(null)
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [sessionsData, gitExists] = await Promise.all([
        api.projects.sessions(project.id),
        workspacePath
          ? api.fs.hasGitRepo(workspacePath).catch(() => false)
          : Promise.resolve(false),
      ])

      setSessions(sessionsData)
      setHasGitRepo(gitExists)

      if (gitExists && workspacePath) {
        const status = await api.git.status(workspacePath)
        setGitStatus(status)
      } else {
        setGitStatus(null)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [project.id, workspacePath])

  useEffect(() => {
    void load()
  }, [load])

  const sessionsSummary = useMemo(() => {
    const data = sessions ?? []
    const durationMs = data.reduce((acc, s) => acc + (s.durationMs ?? 0), 0)
    const tokenTotal = data.reduce((acc, s) => acc + sumSessionTokens(s), 0)
    const eventTotals = data.reduce(
      (acc, s) => {
        acc.message += s.eventCounts?.message ?? 0
        acc.functionCall += s.eventCounts?.functionCall ?? 0
        acc.agentReasoning += s.eventCounts?.agentReasoning ?? 0
        acc.tokenCount += s.eventCounts?.tokenCount ?? 0
        acc.other += s.eventCounts?.other ?? 0
        return acc
      },
      { message: 0, functionCall: 0, agentReasoning: 0, tokenCount: 0, other: 0 },
    )

    return {
      count: data.length,
      durationMs,
      tokenTotal,
      eventTotals,
    }
  }, [sessions])

  const projectTokenUsage: SessionTokenUsageDto = useMemo(() => {
    const totals = emptyTokenUsage()

    for (const s of sessions ?? []) {
      totals.inputTokens += s.tokenUsage?.inputTokens ?? 0
      totals.cachedInputTokens += s.tokenUsage?.cachedInputTokens ?? 0
      totals.outputTokens += s.tokenUsage?.outputTokens ?? 0
      totals.reasoningOutputTokens += s.tokenUsage?.reasoningOutputTokens ?? 0
    }

    return totals
  }, [sessions])

  const dailyTokenUsage7d: CodexDailyTokenUsageDto[] = useMemo(() => {
    const data = sessions ?? []

    const end = new Date()
    end.setHours(0, 0, 0, 0)
    const start = new Date(end)
    start.setDate(start.getDate() - 6)

    const dayKeys: string[] = []
    const byDay = new Map<string, SessionTokenUsageDto>()

    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const key = formatLocalYmd(d)
      dayKeys.push(key)
      byDay.set(key, emptyTokenUsage())
    }

    for (const s of data) {
      const key = tryGetLocalDayKey(s.lastEventAtUtc || s.createdAtUtc)
      if (!key) continue
      const bucket = byDay.get(key)
      if (!bucket) continue

      bucket.inputTokens += s.tokenUsage?.inputTokens ?? 0
      bucket.cachedInputTokens += s.tokenUsage?.cachedInputTokens ?? 0
      bucket.outputTokens += s.tokenUsage?.outputTokens ?? 0
      bucket.reasoningOutputTokens += s.tokenUsage?.reasoningOutputTokens ?? 0
    }

    return dayKeys.map((date) => ({
      date,
      tokenUsage: byDay.get(date) ?? emptyTokenUsage(),
    }))
  }, [sessions])

  const tokenTotal7d = useMemo(() => {
    return dailyTokenUsage7d.reduce((acc, d) => {
      const u = d.tokenUsage
      return (
        acc +
        (u?.inputTokens ?? 0) +
        (u?.cachedInputTokens ?? 0) +
        (u?.outputTokens ?? 0) +
        (u?.reasoningOutputTokens ?? 0)
      )
    }, 0)
  }, [dailyTokenUsage7d])

  const gitSummary = useMemo(() => {
    if (!gitStatus) return null

    const staged = gitStatus.entries.filter((e) => e.indexStatus !== ' ').length
    const worktree = gitStatus.entries.filter((e) => e.worktreeStatus !== ' ').length
    const untracked = gitStatus.entries.filter(
      (e) => e.indexStatus === '?' && e.worktreeStatus === '?',
    ).length

    return {
      branch: gitStatus.branch,
      repoRoot: gitStatus.repoRoot,
      total: gitStatus.entries.length,
      staged,
      worktree,
      untracked,
    }
  }, [gitStatus])

  return (
    <div className="h-full min-h-0 overflow-auto p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">项目数据汇总</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {project.name} · {project.toolType === 'Codex' ? 'Codex' : 'Claude Code'}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          刷新
          {loading ? <Spinner /> : null}
        </Button>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium">项目信息</div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="break-all">路径：{project.workspacePath}</div>
            <div>
              Provider：{project.providerName || project.providerId || '—'}
            </div>
            <div>Model：{project.model ?? '—'}</div>
            <div>创建：{formatUtc(project.createdAtUtc)}</div>
            <div>更新：{formatUtc(project.updatedAtUtc)}</div>
            <div>最近启动：{formatUtc(project.lastStartedAtUtc) || '—'}</div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium">会话统计</div>
          {sessions ? (
            <div className="mt-3 space-y-1 text-sm">
              <div>会话数：{sessionsSummary.count.toLocaleString()}</div>
              <div>总耗时：{formatDurationMs(sessionsSummary.durationMs)}</div>
              <div title={sessionsSummary.tokenTotal.toLocaleString()}>
                总 Tokens：{formatCompactNumber(sessionsSummary.tokenTotal)}
              </div>
              <div className="text-xs text-muted-foreground">
                消息 {sessionsSummary.eventTotals.message.toLocaleString()} · 工具{' '}
                {sessionsSummary.eventTotals.functionCall.toLocaleString()} · 思考{' '}
                {sessionsSummary.eventTotals.agentReasoning.toLocaleString()}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-muted-foreground">
              {loading ? '统计中…' : '暂无数据'}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-card p-4">
        <div className="text-sm font-medium">Token 汇总</div>
        <div className="mt-1 text-xs text-muted-foreground">
          汇总该项目所有会话的输入 / 缓存 / 输出 / 思考 Token，并展示最近 7 天每天消耗。
        </div>

        {sessions ? (
          <div className="mt-4 space-y-4">
            <TokenUsageBar usage={projectTokenUsage} />

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-md border bg-background/40 p-2">
                <div className="text-xs text-muted-foreground">输入</div>
                <div className="mt-1 font-medium tabular-nums" title={projectTokenUsage.inputTokens.toLocaleString()}>
                  {formatCompactNumber(projectTokenUsage.inputTokens)}
                </div>
              </div>
              <div className="rounded-md border bg-background/40 p-2">
                <div className="text-xs text-muted-foreground">缓存</div>
                <div className="mt-1 font-medium tabular-nums" title={projectTokenUsage.cachedInputTokens.toLocaleString()}>
                  {formatCompactNumber(projectTokenUsage.cachedInputTokens)}
                </div>
              </div>
              <div className="rounded-md border bg-background/40 p-2">
                <div className="text-xs text-muted-foreground">输出</div>
                <div className="mt-1 font-medium tabular-nums" title={projectTokenUsage.outputTokens.toLocaleString()}>
                  {formatCompactNumber(projectTokenUsage.outputTokens)}
                </div>
              </div>
              <div className="rounded-md border bg-background/40 p-2">
                <div className="text-xs text-muted-foreground">思考</div>
                <div className="mt-1 font-medium tabular-nums" title={projectTokenUsage.reasoningOutputTokens.toLocaleString()}>
                  {formatCompactNumber(projectTokenUsage.reasoningOutputTokens)}
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-background/40 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-xs text-muted-foreground">最近 7 天</div>
                <div className="text-xs font-medium tabular-nums" title={tokenTotal7d.toLocaleString()}>
                  总计：{formatCompactNumber(tokenTotal7d)}
                </div>
              </div>
              <div className="mt-3">
                <TokenUsageDailyChart days={dailyTokenUsage7d} />
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-muted-foreground">
            {loading ? '统计中…' : '暂无数据'}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border bg-card p-4">
        <div className="text-sm font-medium">Git 状态</div>
        {hasGitRepo === false ? (
          <div className="mt-2 text-sm text-muted-foreground">未检测到 Git 仓库</div>
        ) : null}
        {hasGitRepo && gitSummary ? (
          <div className="mt-3 space-y-1 text-sm">
            <div>分支：{gitSummary.branch ?? '—'}</div>
            <div className="break-all">根目录：{gitSummary.repoRoot}</div>
            <div>
              变更：{gitSummary.total.toLocaleString()}（暂存{' '}
              {gitSummary.staged.toLocaleString()} · 工作区{' '}
              {gitSummary.worktree.toLocaleString()} · 未跟踪{' '}
              {gitSummary.untracked.toLocaleString()}）
            </div>
          </div>
        ) : hasGitRepo ? (
          <div className="mt-2 text-sm text-muted-foreground">
            {loading ? '加载中…' : '暂无数据'}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export const ProjectWorkspacePage = forwardRef<ProjectWorkspaceHandle, ProjectWorkspacePageProps>(
  function ProjectWorkspacePage({ projectId }: ProjectWorkspacePageProps, ref) {
  const { id: routeId } = useParams()
  const [searchParams] = useSearchParams()
  const id =
    projectId ??
    routeId ??
    searchParams.get('projects') ??
    searchParams.get('project') ??
    undefined

  const [project, setProject] = useState<ProjectDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [toolsPanelOpen, setToolsPanelOpen] = useState(true)
  const [fileManagerOpen, setFileManagerOpen] = useState(true)
  const [fileManagerWidthPx, setFileManagerWidthPx] = useState(320)
  const fileManagerWidthInitializedRef = useRef(false)

  const workspaceBodyRef = useRef<HTMLDivElement | null>(null)
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [resizing, setResizing] = useState(false)

  const [tabs, setTabs] = useState<WorkspaceTab[]>([])
  const [activeView, setActiveView] = useState<WorkspaceView>({ kind: 'empty' })
  const [filePreviewByPath, setFilePreviewByPath] = useState<Record<string, FilePreview>>({})
  const [diffPreviewByFile, setDiffPreviewByFile] = useState<Record<string, DiffPreview>>({})
  const previewInFlightRef = useRef<Set<string>>(new Set())
  const diffInFlightRef = useRef<Set<string>>(new Set())

  const [detailsPortalTarget, setDetailsPortalTarget] = useState<HTMLDivElement | null>(null)
  const detailsOpen = activeView.kind === 'output'

  const terminalHandleRef = useRef<TerminalViewHandle | null>(null)
  const terminalBacklogRef = useRef<string[]>([])
  const terminalFocusRequestedRef = useRef(false)
  const terminalHasOutputRef = useRef(false)
  const [terminalHasOutput, setTerminalHasOutput] = useState(false)
  const [terminalCwd, setTerminalCwd] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.projects.get(id)
      setProject(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const workspacePath = (project?.workspacePath ?? '').trim()

  useEffect(() => {
    setTabs([])
    setActiveView({ kind: 'empty' })
    setFilePreviewByPath({})
    setDiffPreviewByFile({})

    terminalBacklogRef.current = []
    terminalHasOutputRef.current = false
    setTerminalHasOutput(false)
    setTerminalCwd(workspacePath)
    terminalHandleRef.current?.reset()
  }, [workspacePath])

  useEffect(() => {
    if (!toolsPanelOpen) return
    if (!fileManagerOpen) return
    if (fileManagerWidthInitializedRef.current) return
    const container = workspaceBodyRef.current
    if (!container) return
    const width = container.clientWidth
    if (!width) return

    const min = 240
    const max = Math.max(min, Math.floor(width * 0.6))
    setFileManagerWidthPx(clamp(Math.round(width / 3), min, max))
    fileManagerWidthInitializedRef.current = true
  }, [fileManagerOpen, toolsPanelOpen])

  const fetchPreview = useCallback(async (path: string) => {
    if (previewInFlightRef.current.has(path)) return
    previewInFlightRef.current.add(path)

    setFilePreviewByPath((prev) => ({
      ...prev,
      [path]: {
        loading: true,
        error: null,
        content: prev[path]?.content ?? '',
        truncated: prev[path]?.truncated ?? false,
        isBinary: prev[path]?.isBinary ?? false,
      },
    }))

    try {
      const data = await api.fs.readFile(path)
      setFilePreviewByPath((prev) => ({
        ...prev,
        [path]: {
          loading: false,
          error: null,
          content: data.content,
          truncated: data.truncated,
          isBinary: data.isBinary,
        },
      }))
    } catch (e) {
      setFilePreviewByPath((prev) => ({
        ...prev,
        [path]: {
          loading: false,
          error: (e as Error).message,
          content: prev[path]?.content ?? '',
          truncated: prev[path]?.truncated ?? false,
          isBinary: prev[path]?.isBinary ?? false,
        },
      }))
    } finally {
      previewInFlightRef.current.delete(path)
    }
  }, [])

  const fetchDiff = useCallback(
    async (file: string) => {
      const path = workspacePath.trim()
      if (!path) return

      if (diffInFlightRef.current.has(file)) return
      diffInFlightRef.current.add(file)

      setDiffPreviewByFile((prev) => ({
        ...prev,
        [file]: {
          loading: true,
          error: null,
          diff: prev[file]?.diff ?? '',
          truncated: prev[file]?.truncated ?? false,
        },
      }))

      try {
        const data = await api.git.diff(path, file)
        setDiffPreviewByFile((prev) => ({
          ...prev,
          [file]: {
            loading: false,
            error: null,
            diff: data.diff,
            truncated: data.truncated,
          },
        }))
      } catch (e) {
        setDiffPreviewByFile((prev) => ({
          ...prev,
          [file]: {
            loading: false,
            error: (e as Error).message,
            diff: prev[file]?.diff ?? '',
            truncated: prev[file]?.truncated ?? false,
          },
        }))
      } finally {
        diffInFlightRef.current.delete(file)
      }
    },
    [workspacePath],
  )

  const openFile = useCallback(
    (path: string) => {
      const normalized = path.trim()
      if (!normalized) return
      setToolsPanelOpen(true)

      setTabs((prev) => {
        const exists = prev.some((t) => t.kind === 'file' && t.path === normalized)
        if (exists) return prev
        return [...prev, { kind: 'file', path: normalized }]
      })

      setActiveView({ kind: 'file', path: normalized })

      const existing = filePreviewByPath[normalized]
      if (!existing) {
        void fetchPreview(normalized)
      }
    },
    [fetchPreview, filePreviewByPath],
  )

  const openDiff = useCallback(
    (file: string) => {
      const normalized = file.trim()
      if (!normalized) return
      setToolsPanelOpen(true)

      setTabs((prev) => {
        const exists = prev.some((t) => t.kind === 'diff' && t.file === normalized)
        if (exists) return prev
        return [...prev, { kind: 'diff', file: normalized }]
      })

      setActiveView({ kind: 'diff', file: normalized })

      const existing = diffPreviewByFile[normalized]
      if (!existing) {
        void fetchDiff(normalized)
      }
    },
    [diffPreviewByFile, fetchDiff],
  )

  const openProjectSummary = useCallback(() => {
    setToolsPanelOpen(true)
    setTabs((prev) => {
      const exists = prev.some((t) => t.kind === 'panel' && t.panelId === 'project-summary')
      if (exists) return prev
      return [...prev, { kind: 'panel', panelId: 'project-summary' }]
    })
    setActiveView({ kind: 'panel', panelId: 'project-summary' })
  }, [])

  const markTerminalHasOutput = useCallback(() => {
    if (terminalHasOutputRef.current) return
    terminalHasOutputRef.current = true
    setTerminalHasOutput(true)
  }, [])

  const appendTerminalOutput = useCallback(
    (chunk: string) => {
      if (!chunk) return
      markTerminalHasOutput()

      terminalBacklogRef.current.push(chunk)
      if (terminalBacklogRef.current.length > 2000) {
        terminalBacklogRef.current.splice(0, terminalBacklogRef.current.length - 2000)
      }

      terminalHandleRef.current?.write(chunk)
    },
    [markTerminalHasOutput],
  )

  const clearTerminal = useCallback(() => {
    terminalBacklogRef.current = []
    terminalHasOutputRef.current = false
    setTerminalHasOutput(false)
    terminalHandleRef.current?.reset()
  }, [])

  const openExternalTerminal = useCallback(async (path: string) => {
    const normalized = path.trim()
    if (!normalized) return
    try {
      await api.fs.openTerminal(normalized)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const setTerminalHandle = useCallback((handle: TerminalViewHandle | null) => {
    terminalHandleRef.current = handle
    if (!handle) return

    const backlog = terminalBacklogRef.current
    if (backlog.length) {
      handle.reset()
      for (const chunk of backlog) {
        handle.write(chunk)
      }
    }

    if (terminalFocusRequestedRef.current) {
      terminalFocusRequestedRef.current = false
      handle.focus()
    }

    handle.fit()
  }, [])

  const openTerminal = useCallback(
    (opts?: { path?: string; focus?: boolean }) => {
      const nextPath = (opts?.path ?? terminalCwd ?? workspacePath).trim()
      if (nextPath) setTerminalCwd(nextPath)

      setToolsPanelOpen(true)
      setActiveView({ kind: 'terminal' })

      if (opts?.focus) {
        terminalFocusRequestedRef.current = true
        window.setTimeout(() => terminalHandleRef.current?.focus(), 0)
      }
    },
    [terminalCwd, workspacePath],
  )

  useImperativeHandle(
    ref,
    () => ({
      openFile,
      openProjectSummary,
      openTerminal,
    }),
    [openFile, openProjectSummary, openTerminal],
  )

  const closeTab = useCallback(
    (tab: WorkspaceTab) => {
      const key = getTabKey(tab)

      setTabs((prev) => {
        const next = prev.filter((t) => getTabKey(t) !== key)

        setActiveView((view) => {
          const isActive =
            (tab.kind === 'file' && view.kind === 'file' && view.path === tab.path) ||
            (tab.kind === 'diff' && view.kind === 'diff' && view.file === tab.file) ||
            (tab.kind === 'panel' && view.kind === 'panel' && view.panelId === tab.panelId)
          if (!isActive) return view

          const last = next[next.length - 1]
          if (!last) return { kind: 'empty' }
          switch (last.kind) {
            case 'file':
              return { kind: 'file', path: last.path }
            case 'diff':
              return { kind: 'diff', file: last.file }
            case 'panel':
              return { kind: 'panel', panelId: last.panelId }
          }
        })

        return next
      })

      if (tab.kind === 'file') {
        setFilePreviewByPath((prev) => {
          const next = { ...prev }
          delete next[tab.path]
          return next
        })
      } else if (tab.kind === 'diff') {
        setDiffPreviewByFile((prev) => {
          const next = { ...prev }
          delete next[tab.file]
          return next
        })
      }
    },
    [],
  )

  const startResize = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!fileManagerOpen) return
      const container = workspaceBodyRef.current
      if (!container) return

      resizeStateRef.current = { startX: e.clientX, startWidth: fileManagerWidthPx }
      setResizing(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [fileManagerOpen, fileManagerWidthPx],
  )

  const moveResize = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!resizing) return
      const state = resizeStateRef.current
      const container = workspaceBodyRef.current
      if (!state || !container) return

      const width = container.clientWidth
      if (!width) return

      const delta = e.clientX - state.startX
      const min = 240
      const minRight = 360
      const max = Math.max(min, width - minRight)
      const next = clamp(state.startWidth + delta, min, max)
      setFileManagerWidthPx(next)
    },
    [resizing],
  )

  const stopResize = useCallback(() => {
    resizeStateRef.current = null
    setResizing(false)
  }, [])

  const mainTabs = useMemo(() => {
    return tabs.map((tab) => {
      if (tab.kind === 'file') {
        return { ...tab, key: getTabKey(tab), label: getBaseName(tab.path), title: tab.path }
      }

      if (tab.kind === 'diff') {
        return {
          ...tab,
          key: getTabKey(tab),
          label: `Diff: ${getBaseName(tab.file)}`,
          title: tab.file,
        }
      }

      return {
        ...tab,
        key: getTabKey(tab),
        label: tab.panelId === 'project-summary' ? '汇总' : tab.panelId,
        title: tab.panelId === 'project-summary' ? '项目数据汇总' : tab.panelId,
      }
    })
  }, [tabs])

  const renderMain = () => {
    if (activeView.kind === 'panel') {
      if (activeView.panelId === 'project-summary') {
        if (!project) {
          return (
            <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Spinner /> 加载中…
              </span>
            </div>
          )
        }
        return <ProjectSummaryPanel project={project} />
      }

      return (
        <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
          未知面板：{activeView.panelId}
        </div>
      )
    }

    if (activeView.kind === 'terminal') {
      const cwd = terminalCwd.trim() || workspacePath
      return (
        <div className="h-full min-h-0 overflow-hidden flex flex-col">
          <div className="shrink-0 border-b px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">Terminal</div>
                <div
                  className="mt-0.5 truncate text-[11px] text-muted-foreground"
                  title={cwd}
                >
                  {cwd || '（未设置工作目录）'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!terminalHasOutput}
                  onClick={clearTerminal}
                >
                  清空
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!cwd}
                  onClick={() => void openExternalTerminal(cwd)}
                >
                  外部终端
                </Button>
              </div>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
            <TerminalView
              ref={setTerminalHandle}
              className="h-full"
              ariaLabel="Project terminal"
              options={{ disableStdin: true, cursorBlink: false }}
            />
            {!terminalHasOutput ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
                <div className="max-w-sm text-xs text-muted-foreground">
                  这里会显示 Codex / Claude Code 的工具输出（命令执行日志）。开始一次对话或运行工具后，
                  输出会自动流入。
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )
    }

    if (activeView.kind === 'output') {
      return <div ref={setDetailsPortalTarget} className="h-full min-h-0 overflow-hidden" />
    }

    if (activeView.kind === 'diff') {
      const preview = diffPreviewByFile[activeView.file]
      if (!preview || preview.loading) {
        return (
          <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Spinner /> 加载中…
            </span>
          </div>
        )
      }

      if (preview.error) {
        return (
          <div className="h-full min-h-0 overflow-auto px-4 py-6 text-sm text-destructive">
            {preview.error}
          </div>
        )
      }

      return (
        <div className="h-full min-h-0 overflow-hidden flex flex-col">
          {preview.truncated ? (
            <div className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              Diff 已截断（仅展示前一部分）。
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">
            {preview.diff ? (
              <ShikiCode code={preview.diff} language="diff" className="h-full" />
            ) : (
              <div className="px-4 py-4 text-xs text-muted-foreground">（无 diff）</div>
            )}
          </div>
        </div>
      )
    }

    if (activeView.kind === 'file') {
      const preview = filePreviewByPath[activeView.path]
      if (!preview || preview.loading) {
        return (
          <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Spinner /> 加载中…
            </span>
          </div>
        )
      }

      if (preview.error) {
        return (
          <div className="h-full min-h-0 overflow-auto px-4 py-6 text-sm text-destructive">
            {preview.error}
          </div>
        )
      }

      if (preview.isBinary) {
        return (
          <div className="h-full min-h-0 overflow-auto px-4 py-6 text-sm text-muted-foreground">
            该文件可能是二进制文件，暂不支持预览。
          </div>
        )
      }

      return (
        <div className="h-full min-h-0 overflow-hidden flex flex-col">
          {preview.truncated ? (
            <div className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              内容已截断（仅展示前一部分）。
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">
            {preview.content ? (
              <MonacoCode code={preview.content} filePath={activeView.path} className="h-full" />
            ) : (
              <div className="px-4 py-4 text-xs text-muted-foreground">（空文件）</div>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="flex h-full min-h-0 items-center justify-center text-center">
        <div className="max-w-sm">
          <div className="text-sm font-medium">No tabs open</div>
          <div className="mt-1 text-xs text-muted-foreground">
            预览一个文件，或打开终端开始工作。
          </div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button type="button" variant="outline" onClick={() => openTerminal({ focus: true })}>
              打开终端
            </Button>
            <Button type="button" variant="outline" onClick={() => setActiveView({ kind: 'output' })}>
              工具输出
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col">
      {error ? (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className={cn('min-h-0 flex-1 overflow-hidden flex', toolsPanelOpen ? 'gap-4' : '')}>
        <section
          className={cn(
            'min-h-0 overflow-hidden rounded-lg border bg-card flex flex-col',
            toolsPanelOpen ? 'w-[620px] shrink-0' : 'flex-1',
          )}
        >
          {project ? (
            <ProjectChat
              key={project.id}
              project={project}
              detailsOpen={detailsOpen}
              detailsPortalTarget={detailsPortalTarget}
              onToolOutput={appendTerminalOutput}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden p-4 text-sm text-muted-foreground">
              {loading ? '加载中…' : '未找到项目。'}
            </div>
          )}
        </section>

        {toolsPanelOpen && project ? (
          <aside className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-card flex flex-col">
            <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
              <div className="flex items-center gap-1">
                {!fileManagerOpen ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title="打开文件管理"
                    onClick={() => setFileManagerOpen(true)}
                  >
                    <Folder className="size-4" />
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="终端"
                  onClick={() => openTerminal({ focus: true })}
                >
                  <Terminal className="size-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="工具输出"
                  onClick={() => setActiveView({ kind: 'output' })}
                >
                  <FileText className="size-4" />
                </Button>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="收起工具栏"
                onClick={() => setToolsPanelOpen(false)}
              >
                <PanelRightClose className="size-4" />
              </Button>
            </div>

            <div ref={workspaceBodyRef} className="min-h-0 flex-1 overflow-hidden flex">
              {fileManagerOpen ? (
                <>
                  <div className="shrink-0 overflow-hidden" style={{ width: fileManagerWidthPx }}>
                    <ProjectFileManager
                      workspacePath={workspacePath}
                      onRequestClose={() => setFileManagerOpen(false)}
                      onOpenFile={openFile}
                      onOpenDiff={openDiff}
                      onOpenTerminal={(path) => openTerminal({ path, focus: true })}
                      className="h-full"
                    />
                  </div>

                  <div
                    role="separator"
                    aria-orientation="vertical"
                    className={cn(
                      'w-1 shrink-0 cursor-col-resize bg-border/30',
                      'hover:bg-border/60',
                      resizing ? 'bg-border' : '',
                    )}
                    onPointerDown={startResize}
                    onPointerMove={moveResize}
                    onPointerUp={stopResize}
                    onPointerCancel={stopResize}
                  />
                </>
              ) : null}

              <div className="min-w-0 flex-1 overflow-hidden flex flex-col">
                <div className="shrink-0 border-b px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 overflow-x-auto">
                      <div className="flex min-w-fit items-center gap-1">
                        {mainTabs.map((tab) => {
                          const active =
                            (tab.kind === 'file' &&
                              activeView.kind === 'file' &&
                              activeView.path === tab.path) ||
                            (tab.kind === 'diff' &&
                              activeView.kind === 'diff' &&
                              activeView.file === tab.file) ||
                            (tab.kind === 'panel' &&
                              activeView.kind === 'panel' &&
                              activeView.panelId === tab.panelId)

                          const iconUrl =
                            tab.kind === 'file'
                              ? getVscodeFileIconUrl(getBaseName(tab.path))
                              : tab.kind === 'diff'
                                ? getVscodeFileIconUrl(getBaseName(tab.file))
                                : null
                          return (
                            <div
                              key={tab.key}
                              className={cn(
                                'group inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
                                'max-w-[220px]',
                                active
                                  ? 'bg-accent text-accent-foreground'
                                  : 'bg-background/40 text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                              )}
                            >
                              <button
                                type="button"
                                className="min-w-0 flex min-w-0 flex-1 items-center gap-1 text-left"
                                onClick={() => {
                                  if (tab.kind === 'file') {
                                    setActiveView({ kind: 'file', path: tab.path })
                                    return
                                  }
                                  if (tab.kind === 'diff') {
                                    setActiveView({ kind: 'diff', file: tab.file })
                                    return
                                  }
                                  setActiveView({ kind: 'panel', panelId: tab.panelId })
                                }}
                                title={tab.title}
                              >
                                {iconUrl ? (
                                  <img
                                    src={iconUrl}
                                    alt=""
                                    aria-hidden="true"
                                    draggable={false}
                                    className="size-4 shrink-0"
                                  />
                                ) : null}
                                <span className="truncate">{tab.label}</span>
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  'rounded-sm p-0.5 text-muted-foreground hover:bg-background/60 hover:text-foreground',
                                  'opacity-0 group-hover:opacity-100',
                                  active ? 'opacity-100' : '',
                                )}
                                onClick={() => closeTab(tab)}
                                title="关闭"
                              >
                                <X className="size-3" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant={activeView.kind === 'terminal' ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => openTerminal({ focus: true })}
                      title="终端"
                    >
                      Terminal
                    </Button>
                    <Button
                      type="button"
                      variant={activeView.kind === 'output' ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setActiveView({ kind: 'output' })}
                      title="工具输出"
                    >
                      Output
                    </Button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">{renderMain()}</div>
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(
          'fixed right-4 top-4 z-40 shadow-md transition-[opacity,transform] duration-200 ease-out',
          toolsPanelOpen ? 'pointer-events-none translate-y-1 opacity-0 scale-95' : 'opacity-100',
        )}
        title="展开工具栏"
        onClick={() => setToolsPanelOpen(true)}
      >
        <PanelRightOpen className="size-4" />
        <span className="sr-only">展开工具栏</span>
      </Button>
    </div>
  )
  },
)
