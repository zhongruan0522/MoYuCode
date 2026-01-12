import { memo, useEffect, useState } from 'react'
import { api } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { ShikiCode } from '@/components/ShikiCode'
import type { EnterPlanModeToolInput, ExitPlanModeToolInput } from '@/components/project-workspace/tool-inputs/planModeType'

interface EnterPlanModeToolContentProps {
  input: EnterPlanModeToolInput
}

export const EnterPlanModeToolContent = memo(function EnterPlanModeToolContent({ input }: EnterPlanModeToolContentProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-muted-foreground">Enter Plan Mode</div>
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-blue-400">
          planning
        </Badge>
      </div>

      {input.message ? (
        <div className="text-sm leading-relaxed">{input.message}</div>
      ) : null}
    </div>
  )
})

interface ExitPlanModeToolContentProps {
  input: ExitPlanModeToolInput
  planContent: string | null
}

export const ExitPlanModeToolContent = memo(function ExitPlanModeToolContent({ input, planContent }: ExitPlanModeToolContentProps) {
  let parsed: unknown = []
  try {
    parsed = JSON.parse(planContent ?? '[]')
  } catch {
    parsed = []
  }

  let planFromContent: string | null = null
  let filePathFromContent: string | undefined

  if (Array.isArray(parsed)) {
    const textEntry = parsed.find(
      (item): item is { text: string } =>
        typeof item === 'object' && item !== null && typeof (item as { text?: unknown }).text === 'string',
    )
    const textValue = textEntry?.text

    if (textValue) {
      try {
        const inner = JSON.parse(textValue) as { plan?: unknown; filePath?: unknown }
        if (typeof inner === 'object' && inner !== null && 'plan' in inner) {
          if (typeof inner.plan === 'string') {
            planFromContent = inner.plan
          }
          filePathFromContent = typeof inner.filePath === 'string' ? inner.filePath : undefined
        } else {
          planFromContent = textValue
        }
      } catch {
        planFromContent = textValue
      }
    }
  } else if (parsed && typeof parsed === 'object' && 'plan' in (parsed as Record<string, unknown>)) {
    const inner = parsed as { plan?: unknown; filePath?: unknown }
    if (typeof inner.plan === 'string') {
      planFromContent = inner.plan
    }
    filePathFromContent = typeof inner.filePath === 'string' ? inner.filePath : undefined
  }

  const displayPlan = planFromContent ?? input.plan ?? null
  const displayFilePath = filePathFromContent

  const [planFromFile, setPlanFromFile] = useState<string | null>(null)
  const [isLoadingPlan, setIsLoadingPlan] = useState(false)

  useEffect(() => {
    if (displayPlan || !displayFilePath) {
      setPlanFromFile(null)
      setIsLoadingPlan(false)
      return
    }

    let cancelled = false
    setPlanFromFile(null)
    setIsLoadingPlan(true)

    void (async () => {
      try {
        const data = await api.fs.readFile(displayFilePath)
        if (cancelled) return
        setPlanFromFile(typeof data.content === 'string' ? data.content : null)
      } catch {
        if (!cancelled) setPlanFromFile(null)
      } finally {
        if (!cancelled) setIsLoadingPlan(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [displayFilePath, displayPlan])

  const planToRender = displayPlan ?? planFromFile

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-muted-foreground">Exit Plan Mode</div>
        {input.isAgent ? (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-purple-400">
            agent
          </Badge>
        ) : null}
      </div>
      
      {displayFilePath ? (
        <div className="text-xs text-muted-foreground truncate">{displayFilePath}</div>
      ) : null}

      {planToRender ? (
        <div style={{
          minWidth: '320px'
        }} className="h-[320px] w-full overflow-hidden rounded-md border bg-background">
          <ShikiCode
            code={planToRender}
            language="markdown"
            className="h-full"
          />
        </div>
      ) : isLoadingPlan ? (
        <div style={{
          minWidth: '320px'
        }} className="flex h-[320px] w-full items-center justify-center overflow-hidden rounded-md border bg-background text-xs text-muted-foreground">
          正在读取计划…
        </div>
      ) : null}
    </div>
  )
})
