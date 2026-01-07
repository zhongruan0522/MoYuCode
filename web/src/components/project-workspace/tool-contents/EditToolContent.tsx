import { memo } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/animate-ui/primitives/animate/tooltip'
import { DiffViewer } from '@/components/DiffViewer'
import type { EditToolInput } from '@/lib/toolInputParsers'

interface EditToolContentProps {
  input: EditToolInput
  diff: string
}

export const EditToolContent = memo(function EditToolContent({ input, diff }: EditToolContentProps) {
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
          diff={diff}
          viewMode="unified"
          hideMeta
          hideHunks
          className="h-full"
        />
      </div>
    </div>
  )
})
