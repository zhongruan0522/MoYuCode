import { memo, useMemo } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/animate-ui/primitives/animate/tooltip'
import { DiffViewer } from '@/components/DiffViewer'
import type { EditToolInput } from '@/lib/toolInputParsers'

interface EditToolContentProps {
  input: EditToolInput
  diff: string
}

/**
 * 从 structuredPatch 构建 unified diff 格式字符串
 */
function buildDiffFromStructuredPatch(filePath: string, hunks: NonNullable<EditToolInput['structuredPatch']>): string {
  const lines: string[] = []
  lines.push(`--- a/${filePath}`)
  lines.push(`+++ b/${filePath}`)
  
  for (const hunk of hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`)
    lines.push(...hunk.lines)
  }
  
  return lines.join('\n')
}

export const EditToolContent = memo(function EditToolContent({ input, diff }: EditToolContentProps) {
  // 优先使用 structuredPatch 构建 diff
  const finalDiff = useMemo(() => {
    if (input.structuredPatch && input.structuredPatch.length > 0) {
      return buildDiffFromStructuredPatch(input.filePath, input.structuredPatch)
    }
    return diff
  }, [input.filePath, input.structuredPatch, diff])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tooltip side="top" sideOffset={8}>
          <TooltipTrigger asChild>
            <div className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
              {input.filePath}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs break-all">{input.filePath}</TooltipContent>
        </Tooltip>
      </div>
      <div className="h-[240px] overflow-hidden rounded-md border bg-background">
        <DiffViewer
          diff={finalDiff}
          viewMode="unified"
          hideMeta
          hideHunks
          className="h-full"
        />
      </div>
    </div>
  )
})
