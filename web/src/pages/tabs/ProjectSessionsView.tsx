import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, formatUtc } from '@/api/client'
import type { ProjectDto, ProjectSessionDto, SessionTimelineBucketDto } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString()
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  if (hours > 0) return `${hours}小时${minutes}分`
  if (minutes > 0) return `${minutes}分${seconds}秒`
  return `${seconds}秒`
}

function TimelineSpark({ buckets }: { buckets: SessionTimelineBucketDto[] }) {
  const totals = useMemo(() => {
    return buckets.map((b) => b.message + b.functionCall + b.agentReasoning)
  }, [buckets])

  const maxTotal = useMemo(() => {
    return totals.reduce((acc, n) => (n > acc ? n : acc), 0)
  }, [totals])

  const bars = useMemo(() => {
    return buckets.map((b, i) => {
      const total = totals[i] ?? 0
      if (!maxTotal || !total) {
        return {
          key: i,
          height: 2,
          parts: [] as { color: string; height: number }[],
          title: '无数据',
        }
      }

      const height = Math.max(2, Math.round((total / maxTotal) * 24))
      const base = [
        { key: 'message' as const, count: b.message, color: 'bg-emerald-500/90' },
        { key: 'functionCall' as const, count: b.functionCall, color: 'bg-sky-500/90' },
        { key: 'agentReasoning' as const, count: b.agentReasoning, color: 'bg-amber-500/90' },
      ].filter((x) => x.count > 0)

      const sum = base.reduce((acc, x) => acc + x.count, 0)
      const heights = base.map((x) => Math.round((x.count / sum) * height))

      for (let k = 0; k < heights.length; k++) {
        if (heights[k] === 0) heights[k] = 1
      }

      const currentSum = heights.reduce((acc, n) => acc + n, 0)
      if (currentSum !== height) {
        const delta = height - currentSum
        heights[heights.length - 1] = Math.max(1, heights[heights.length - 1] + delta)
      }

      const parts: { color: string; height: number }[] = base.map((x, idx) => ({
        color: x.color,
        height: heights[idx] ?? 0,
      }))

      return {
        key: i,
        height,
        parts,
        title: `message ${b.message} / function_call ${b.functionCall} / agent_reasoning ${b.agentReasoning}`,
      }
    })
  }, [buckets, maxTotal, totals])

  if (!buckets.length) {
    return <div className="text-xs text-muted-foreground">—</div>
  }

  return (
    <div className="flex h-7 items-end gap-0.5">
      {bars.map((bar) => (
        <div
          key={bar.key}
          className="flex w-1 flex-col-reverse overflow-hidden rounded-sm bg-muted/30"
          style={{ height: `${bar.height}px` }}
          title={bar.title}
        >
          {bar.parts.map((p, idx) => (
            <div key={idx} className={p.color} style={{ height: `${p.height}px` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ProjectSessionsView({
  project,
  onBack,
}: {
  project: ProjectDto
  onBack: () => void
}) {
  const [sessions, setSessions] = useState<ProjectSessionDto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.projects.sessions(project.id)
      setSessions(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [project.id])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onBack}>
              返回
            </Button>
            <div className="text-sm font-medium">
              {project.name}：会话
            </div>
            {loading ? <Spinner /> : null}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            扫描本机 Codex sessions 并按创建时间排序。
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          刷新
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3 text-sm font-medium">
          会话列表 {sessions.length ? `（${sessions.length}）` : ''}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[70rem] table-fixed text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="w-[14rem] px-4 py-2 text-left whitespace-nowrap">
                  创建时间
                </th>
                <th className="w-[7rem] px-4 py-2 text-left whitespace-nowrap">
                  时长
                </th>
                <th className="w-[14rem] px-4 py-2 text-left whitespace-nowrap">
                  Tokens（汇总）
                </th>
                <th className="px-4 py-2 text-left whitespace-nowrap">
                  时间线（message / function_call / agent_reasoning）
                </th>
                <th className="w-[10rem] px-4 py-2 text-right whitespace-nowrap">
                  结束时间
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.length ? (
                sessions.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="font-medium">{formatUtc(s.createdAtUtc)}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.id}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {formatDuration(s.durationMs)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                        <div>in: {formatNumber(s.tokenUsage.inputTokens)}</div>
                        <div>cache: {formatNumber(s.tokenUsage.cachedInputTokens)}</div>
                        <div>out: {formatNumber(s.tokenUsage.outputTokens)}</div>
                        <div>reason: {formatNumber(s.tokenUsage.reasoningOutputTokens)}</div>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <TimelineSpark buckets={s.timeline} />
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {formatUtc(s.lastEventAtUtc)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                    {loading ? '扫描中…' : '未找到会话。'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
