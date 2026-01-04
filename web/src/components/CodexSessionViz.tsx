import { useMemo, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  CodexDailyTokenUsageDto,
  SessionTraceSpanDto,
  SessionTokenUsageDto,
} from '@/api/types'
import { cn } from '@/lib/utils'

type TraceKind = 'tool' | 'waiting' | 'think' | 'gen'

type TraceSegment = SessionTraceSpanDto & { startMs: number; endMs: number }
type DisplayTraceSegment = TraceSegment & {
  displayDurationMs: number
  collapsed: boolean
}

type FillSpec = { fill: string; fillOpacity: number }

const traceFill: Record<TraceKind, FillSpec> = {
  tool: { fill: 'var(--foreground)', fillOpacity: 0.85 },
  waiting: { fill: 'var(--muted-foreground)', fillOpacity: 0.35 },
  think: { fill: 'var(--chart-2)', fillOpacity: 0.95 },
  gen: { fill: 'var(--chart-3)', fillOpacity: 0.95 },
}

function getTraceFill(kind: string): FillSpec {
  if (kind === 'tool') return traceFill.tool
  if (kind === 'waiting') return traceFill.waiting
  if (kind === 'think') return traceFill.think
  if (kind === 'gen') return traceFill.gen
  return traceFill.waiting
}

const tokenFill: Record<'in' | 'cache' | 'out' | 'think' | 'reason', FillSpec> = {
  in: { fill: 'var(--chart-2)', fillOpacity: 0.95 },
  cache: { fill: 'var(--chart-2)', fillOpacity: 0.45 },
  out: { fill: 'var(--chart-1)', fillOpacity: 0.9 },
  think: { fill: 'var(--chart-4)', fillOpacity: 0.9 },
  reason: { fill: 'var(--chart-4)', fillOpacity: 0.9 },
}

function getTokenFill(key: string): FillSpec {
  if (key === 'in') return tokenFill.in
  if (key === 'cache') return tokenFill.cache
  if (key === 'out') return tokenFill.out
  if (key === 'think') return tokenFill.think
  if (key === 'reason') return tokenFill.reason
  return { fill: 'var(--muted-foreground)', fillOpacity: 0.3 }
}

function getTooltipPortal(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.body
}

function safeNumber(value: number | null | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString()
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

function TooltipBox({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none max-w-[24rem] rounded-md border border-border/60 bg-popover/95 px-2 py-1.5 text-[11px] text-popover-foreground shadow-lg backdrop-blur-sm">
      {children}
    </div>
  )
}

function TooltipRow({
  swatch,
  label,
  value,
  valueTitle,
  strong = false,
}: {
  swatch?: FillSpec | null
  label: string
  value: string
  valueTitle?: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        {swatch ? (
          <span
            className="inline-block h-3 w-[3px] shrink-0 rounded-full"
            style={{ backgroundColor: swatch.fill, opacity: swatch.fillOpacity }}
          />
        ) : null}
        <span
          className={cn(
            'truncate',
            strong ? 'font-medium text-foreground' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
      </div>
      <span
        className={cn(
          'shrink-0 tabular-nums',
          strong ? 'font-semibold text-foreground' : 'text-foreground',
        )}
        title={valueTitle}
      >
        {value}
      </span>
    </div>
  )
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'tool':
      return '工具'
    case 'think':
      return '思考'
    case 'waiting':
      return '等待'
    case 'gen':
      return '生成'
    default:
      return kind
  }
}

function formatDurationTrace(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '0s'
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return `${minutes}m${seconds}s`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h${mins}m`
}

function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '0%'
  return `${(ratio * 100).toFixed(1)}%`
}

const activeBarStyle = {
  stroke: 'var(--foreground)',
  strokeOpacity: 0.25,
  strokeWidth: 1,
  fillOpacity: 1,
} as const

function buildTraceSegments(trace: SessionTraceSpanDto[]): TraceSegment[] {
  let cursor = 0
  const segments: TraceSegment[] = []

  for (const span of trace) {
    const durationMs = safeNumber(span.durationMs)
    const tokenCount = safeNumber(span.tokenCount)
    const eventCount = safeNumber(span.eventCount)
    if (!durationMs) continue

    const startMs = cursor
    cursor += durationMs
    segments.push({
      kind: span.kind,
      durationMs,
      tokenCount,
      eventCount,
      startMs,
      endMs: cursor,
    })
  }

  return segments
}

function pickTokenUnit(totalTokens: number): number {
  const abs = Math.max(0, Math.floor(Math.abs(totalTokens)))
  if (!abs) return 1

  const candidates = [
    1,
    10,
    50,
    100,
    250,
    500,
    1000,
    2000,
    5000,
    10000,
    20000,
    50000,
    100000,
    200000,
    500000,
    1000000,
  ]

  for (const u of candidates) {
    if (abs / u <= 32) return u
  }
  return 1000000
}

export function SessionTraceBar({
  trace,
  durationMs,
  className,
  collapseWaiting = false,
  waitingClampMs = 30_000,
}: {
  trace: SessionTraceSpanDto[]
  durationMs: number
  className?: string
  collapseWaiting?: boolean
  waitingClampMs?: number
}) {
  const totalDurationMs = useMemo(() => {
    const fromProp = safeNumber(durationMs)
    if (fromProp > 0) return fromProp
    return trace.reduce((acc, s) => acc + safeNumber(s.durationMs), 0)
  }, [durationMs, trace])

  const segments = useMemo(() => buildTraceSegments(trace), [trace])
  const displaySegments = useMemo<DisplayTraceSegment[]>(() => {
    const clamp = Math.max(0, safeNumber(waitingClampMs))
    return segments.map((seg) => {
      const collapsed =
        collapseWaiting &&
        seg.kind === 'waiting' &&
        clamp > 0 &&
        seg.durationMs > clamp
      const displayDurationMs = collapsed ? clamp : seg.durationMs
      return { ...seg, displayDurationMs, collapsed }
    })
  }, [collapseWaiting, segments, waitingClampMs])

  const displayTotalDurationMs = useMemo(() => {
    return displaySegments.reduce((acc, seg) => acc + seg.displayDurationMs, 0)
  }, [displaySegments])

  const collapsedWaitingCount = useMemo(() => {
    return displaySegments.reduce((acc, seg) => acc + (seg.collapsed ? 1 : 0), 0)
  }, [displaySegments])

  const { chartData, segmentByKey } = useMemo(() => {
    const row: Record<string, number | string> = { name: 'trace' }
    const byKey = new Map<string, DisplayTraceSegment>()

    displaySegments.forEach((seg, idx) => {
      const key = `seg_${idx}`
      row[key] = seg.displayDurationMs
      byKey.set(key, seg)
    })

    return { chartData: [row], segmentByKey: byKey }
  }, [displaySegments])

  if (!segments.length || totalDurationMs <= 0) {
    return <div className="text-xs text-muted-foreground">—</div>
  }

  const legend = [
    { key: 'tool', label: '工具' },
    { key: 'think', label: '思考' },
    { key: 'gen', label: '生成' },
    { key: 'waiting', label: '等待' },
  ] as const

  const tooltipPortal = getTooltipPortal()

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="text-xs font-medium text-foreground">时间线</span>
          {legend.map((x) => {
            const swatch = getTraceFill(x.key)
            return (
              <span key={x.key} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-3 w-[3px] rounded-full"
                  style={{ backgroundColor: swatch.fill, opacity: swatch.fillOpacity }}
                />
                <span>{x.label}</span>
              </span>
            )
          })}
          {collapseWaiting && collapsedWaitingCount > 0 ? (
            <span
              className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              title={`已折叠 ${collapsedWaitingCount} 段等待（阈值 ${formatDurationTrace(waitingClampMs)}）`}
            >
              折叠空闲
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
          <span>+0</span>
          <span>{formatDurationTrace(totalDurationMs)}</span>
        </div>
      </div>

      <div className="h-3 w-full overflow-hidden rounded bg-muted/30 ring-1 ring-border/50">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            barCategoryGap={0}
            barGap={0}
          >
            <XAxis type="number" hide domain={[0, Math.max(0, displayTotalDurationMs)]} />
            <YAxis type="category" dataKey="name" hide />
            <RechartsTooltip
              portal={tooltipPortal}
              cursor={false}
              shared={false}
              wrapperStyle={{ zIndex: 60 }}
              content={(props) => {
                const { active, payload } = props
                if (!active || !payload?.length) return null
                const dataKey = payload[0]?.dataKey as string | number | undefined
                const seg = dataKey ? segmentByKey.get(String(dataKey)) : null
                if (!seg) return null

                const eventLabel =
                  seg.kind === 'tool'
                    ? '次工具'
                    : seg.kind === 'think' || seg.kind === 'gen'
                      ? '次模型'
                      : null

                const ratio =
                  totalDurationMs > 0 ? seg.durationMs / totalDurationMs : 0
                const displayRatio =
                  displayTotalDurationMs > 0
                    ? seg.displayDurationMs / displayTotalDurationMs
                    : 0

                return (
                  <TooltipBox>
                    <div className="space-y-1">
                      <TooltipRow
                        swatch={getTraceFill(seg.kind)}
                        label={kindLabel(seg.kind)}
                        value={formatDurationTrace(seg.durationMs)}
                        valueTitle={`占比 ${formatPercent(ratio)}`}
                        strong
                      />

                      <TooltipRow label="占比" value={formatPercent(ratio)} />

                      {seg.collapsed ? (
                        <>
                          <div className="my-1 h-px bg-border/60" />
                          <TooltipRow
                            label="折叠显示"
                            value={formatDurationTrace(seg.displayDurationMs)}
                            valueTitle={`显示占比 ${formatPercent(displayRatio)}`}
                          />
                          <TooltipRow
                            label="显示占比"
                            value={formatPercent(displayRatio)}
                          />
                        </>
                      ) : null}

                      {seg.tokenCount > 0 ? (
                        <TooltipRow
                          label="Token"
                          value={formatCompactNumber(seg.tokenCount)}
                          valueTitle={formatNumber(seg.tokenCount)}
                        />
                      ) : null}

                      {seg.eventCount > 0 && eventLabel ? (
                        <TooltipRow
                          label={eventLabel}
                          value={formatCompactNumber(seg.eventCount)}
                          valueTitle={formatNumber(seg.eventCount)}
                        />
                      ) : null}

                      <div className="my-1 h-px bg-border/60" />
                      <TooltipRow
                        label="范围"
                        value={`+${formatDurationTrace(seg.startMs)} → +${formatDurationTrace(seg.endMs)}`}
                      />
                    </div>
                  </TooltipBox>
                )
              }}
            />
            {displaySegments.map((seg, idx) => {
              const style = getTraceFill(seg.kind)
              return (
                <Bar
                  key={`seg_${idx}`}
                  dataKey={`seg_${idx}`}
                  stackId="trace"
                  fill={style.fill}
                  fillOpacity={style.fillOpacity}
                  activeBar={activeBarStyle}
                  isAnimationActive={false}
                />
              )
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function TokenUsageBar({
  usage,
  className,
}: {
  usage: SessionTokenUsageDto
  className?: string
}) {
  const input = safeNumber(usage.inputTokens)
  const cached = safeNumber(usage.cachedInputTokens)
  const output = safeNumber(usage.outputTokens)
  const reasoning = safeNumber(usage.reasoningOutputTokens)
  const total = input + cached + output + reasoning

  const unit = useMemo(() => pickTokenUnit(total), [total])
  const units = total ? Math.ceil(Math.abs(total) / unit) : 0
  const maxBlocks = 32
  const shownBlocks = Math.min(units, maxBlocks)

  const segments = [
    { key: 'in', label: '输入', value: input },
    { key: 'cache', label: '缓存', value: cached },
    { key: 'out', label: '输出', value: output },
    { key: 'reason', label: '推理', value: reasoning },
  ].filter((s) => s.value > 0)

  const chartData = [
    {
      name: 'Token',
      in: input,
      cache: cached,
      out: output,
      reason: reasoning,
    },
  ]

  const tooltipPortal = getTooltipPortal()

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs text-muted-foreground">Token</div>
        <div className="text-xs font-medium tabular-nums">{formatCompactNumber(total)}</div>
      </div>

      <div
        className="h-2.5 w-full overflow-hidden rounded bg-muted/30 ring-1 ring-border/50"
      >
        {segments.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              barCategoryGap={0}
              barGap={0}
            >
              <XAxis type="number" hide domain={[0, Math.max(0, total)]} />
              <YAxis type="category" dataKey="name" hide />
              <RechartsTooltip
                portal={tooltipPortal}
                cursor={false}
                shared
                wrapperStyle={{ zIndex: 60 }}
                content={(props) => {
                  if (!props.active) return null
                  const lines = [
                    { label: '输入', value: input, key: 'in' },
                    { label: '缓存', value: cached, key: 'cache' },
                    { label: '输出', value: output, key: 'out' },
                    { label: '推理', value: reasoning, key: 'reason' },
                  ].filter((x) => x.value > 0)

                  return (
                    <TooltipBox>
                      <div className="space-y-1">
                        <TooltipRow
                          label="总计"
                          value={formatCompactNumber(total)}
                          valueTitle={formatNumber(total)}
                          strong
                        />
                        {lines.length ? <div className="my-1 h-px bg-border/60" /> : null}
                        {lines.map((line) => (
                          <TooltipRow
                            key={line.key}
                            swatch={getTokenFill(line.key)}
                            label={line.label}
                            value={formatCompactNumber(line.value)}
                            valueTitle={formatNumber(line.value)}
                          />
                        ))}
                      </div>
                    </TooltipBox>
                  )
                }}
              />
              {segments.map((s) => {
                const style = getTokenFill(s.key)
                return (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    stackId="tokens"
                    fill={style.fill}
                    fillOpacity={style.fillOpacity}
                    activeBar={activeBarStyle}
                    isAnimationActive={false}
                  />
                )
              })}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full bg-muted/40" />
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1" title={`1格≈${formatNumber(unit)} Token`}>
          {shownBlocks ? (
            Array.from({ length: shownBlocks }).map((_, idx) => (
              <div
                key={idx}
                className="h-2 w-1 rounded-sm bg-muted-foreground/30"
              />
            ))
          ) : (
            <div className="text-[11px] text-muted-foreground">—</div>
          )}
          {units > maxBlocks ? (
            <div className="ml-1 text-[11px] text-muted-foreground">
              +{formatCompactNumber(units - maxBlocks)}
            </div>
          ) : null}
        </div>
        <div className="text-[11px] text-muted-foreground">
          1格≈{formatCompactNumber(unit)} Token
        </div>
      </div>
    </div>
  )
}

export function TokenUsageColumnChart({
  usage,
  className,
}: {
  usage: SessionTokenUsageDto
  className?: string
}) {
  const input = safeNumber(usage.inputTokens)
  const cached = safeNumber(usage.cachedInputTokens)
  const output = safeNumber(usage.outputTokens)
  const reasoning = safeNumber(usage.reasoningOutputTokens)

  const segments = useMemo(
    () => [
      { key: 'in', label: '输入', value: input, color: 'bg-emerald-500/90' },
      { key: 'cache', label: '缓存', value: cached, color: 'bg-emerald-300/90' },
      { key: 'out', label: '输出', value: output, color: 'bg-sky-500/90' },
      { key: 'think', label: '思考', value: reasoning, color: 'bg-amber-500/90' },
    ],
    [cached, input, output, reasoning],
  )

  const max = useMemo(() => {
    return segments.reduce((acc, s) => Math.max(acc, s.value), 0)
  }, [segments])

  const total = useMemo(() => {
    return segments.reduce((acc, s) => acc + s.value, 0)
  }, [segments])

  const chartData = useMemo(() => {
    return segments.map((s) => ({
      key: s.key,
      label: s.label,
      value: s.value,
    }))
  }, [segments])

  const tooltipPortal = getTooltipPortal()

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs text-muted-foreground">Token（按类型）</div>
        <div className="text-xs font-medium tabular-nums">
          {formatCompactNumber(total)}
        </div>
      </div>

      <div className="space-y-1">
        <div className="h-24 w-full rounded-md bg-muted/20 px-2 ring-1 ring-border/50">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="key" hide />
              <YAxis hide domain={[0, Math.max(0, max)]} />
              <RechartsTooltip
                portal={tooltipPortal}
                cursor={false}
                wrapperStyle={{ zIndex: 60 }}
                content={(props) => {
                  const { active, payload } = props
                  if (!active || !payload?.length) return null
                  const row = (payload[0]?.payload ?? null) as
                    | { label?: string; value?: number; key?: string }
                    | null
                  if (!row) return null

                  const swatch = row.key ? getTokenFill(row.key) : null

                  return (
                    <TooltipBox>
                      <TooltipRow
                        swatch={swatch}
                        label={row.label ?? ''}
                        value={formatCompactNumber(row.value ?? 0)}
                        valueTitle={formatNumber(row.value ?? 0)}
                        strong
                      />
                    </TooltipBox>
                  )
                }}
              />
              <Bar
                dataKey="value"
                radius={[4, 4, 0, 0]}
                activeBar={activeBarStyle}
                isAnimationActive={false}
              >
                {chartData.map((entry) => {
                  const style = getTokenFill(entry.key)
                  return (
                    <Cell
                      key={entry.key}
                      fill={style.fill}
                      fillOpacity={style.fillOpacity}
                    />
                  )
                })}
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(value) => {
                    const n = typeof value === 'number' ? value : Number(value)
                    return Number.isFinite(n) && n > 0 ? formatCompactNumber(n) : ''
                  }}
                  className="fill-foreground"
                  fontSize={11}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {segments.map((seg) => (
            <div key={seg.key} className="flex items-baseline justify-between gap-2">
              <div className="text-[11px] text-muted-foreground">{seg.label}</div>
              <div className="text-[11px] tabular-nums">{formatCompactNumber(seg.value)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatDayLabel(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(5)
  return value
}

export function TokenUsageDailyChart({
  days,
  className,
}: {
  days: CodexDailyTokenUsageDto[]
  className?: string
}) {
  const items = useMemo(() => {
    return (days ?? []).map((d) => {
      const input = safeNumber(d.tokenUsage?.inputTokens)
      const cached = safeNumber(d.tokenUsage?.cachedInputTokens)
      const output = safeNumber(d.tokenUsage?.outputTokens)
      const reasoning = safeNumber(d.tokenUsage?.reasoningOutputTokens)
      const total = input + cached + output + reasoning

      return {
        date: d.date,
        label: formatDayLabel(d.date),
        total,
        in: input,
        cache: cached,
        out: output,
        think: reasoning,
      }
    })
  }, [days])

  const legend = [
    { key: 'in', label: '输入' },
    { key: 'cache', label: '缓存' },
    { key: 'out', label: '输出' },
    { key: 'think', label: '思考' },
  ] as const

  if (!items.length) {
    return <div className="text-sm text-muted-foreground">暂无数据</div>
  }

  const tooltipPortal = getTooltipPortal()

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="text-xs font-medium text-foreground">
          最近 {items.length} 天
        </span>
        {legend.map((x) => (
          (() => {
            const swatch = getTokenFill(x.key)
            return (
              <span key={x.key} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-3 w-[3px] rounded-full"
                  style={{ backgroundColor: swatch.fill, opacity: swatch.fillOpacity }}
                />
                <span>{x.label}</span>
              </span>
            )
          })()
        ))}
      </div>

      <div className="h-32 w-full rounded-md bg-muted/20 px-2 ring-1 ring-border/50">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={items} margin={{ top: 10, right: 8, bottom: 0, left: 8 }}>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            />
            <YAxis hide />
            <RechartsTooltip
              portal={tooltipPortal}
              cursor={false}
              wrapperStyle={{ zIndex: 60 }}
              content={(props) => {
                const { active, payload } = props
                if (!active || !payload?.length) return null
                const row = (payload[0]?.payload ?? null) as (typeof items)[number] | null
                if (!row) return null

                const lines = [
                  { key: 'in', label: '输入', value: row.in },
                  { key: 'cache', label: '缓存', value: row.cache },
                  { key: 'out', label: '输出', value: row.out },
                  { key: 'think', label: '思考', value: row.think },
                ].filter((x) => x.value > 0)

                return (
                  <TooltipBox>
                    <div className="space-y-1">
                      <TooltipRow
                        label={row.date}
                        value={formatCompactNumber(row.total)}
                        valueTitle={formatNumber(row.total)}
                        strong
                      />
                      {lines.length ? <div className="my-1 h-px bg-border/60" /> : null}
                      {lines.map((line) => (
                        <TooltipRow
                          key={line.key}
                          swatch={getTokenFill(line.key)}
                          label={line.label}
                          value={formatCompactNumber(line.value)}
                          valueTitle={formatNumber(line.value)}
                        />
                      ))}
                    </div>
                  </TooltipBox>
                )
              }}
            />
            <Bar
              dataKey="in"
              stackId="daily"
              isAnimationActive={false}
              fill={tokenFill.in.fill}
              fillOpacity={tokenFill.in.fillOpacity}
              activeBar={activeBarStyle}
            />
            <Bar
              dataKey="cache"
              stackId="daily"
              isAnimationActive={false}
              fill={tokenFill.cache.fill}
              fillOpacity={tokenFill.cache.fillOpacity}
              activeBar={activeBarStyle}
            />
            <Bar
              dataKey="out"
              stackId="daily"
              isAnimationActive={false}
              fill={tokenFill.out.fill}
              fillOpacity={tokenFill.out.fillOpacity}
              activeBar={activeBarStyle}
            />
            <Bar
              dataKey="think"
              stackId="daily"
              isAnimationActive={false}
              fill={tokenFill.think.fill}
              fillOpacity={tokenFill.think.fillOpacity}
              activeBar={activeBarStyle}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
