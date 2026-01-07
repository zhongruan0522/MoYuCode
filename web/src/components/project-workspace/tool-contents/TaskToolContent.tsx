import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { MonacoCode } from '@/components/MonacoCode'
import type { TaskToolInput } from '@/components/project-workspace/tool-inputs/taskType'

interface TaskToolContentProps {
  input: TaskToolInput
}

export const TaskToolContent = memo(function TaskToolContent({ input }: TaskToolContentProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-muted-foreground">Task</div>
        {input.subagentType ? (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            {input.subagentType}
          </Badge>
        ) : null}
      </div>

      {input.description ? (
        <div className="text-sm leading-relaxed">{input.description}</div>
      ) : null}

      {input.prompt ? (
        <div className="h-[240px] overflow-hidden rounded-md border bg-background">
          <MonacoCode
            code={input.prompt}
            language="markdown"
            className="h-full"
          />
        </div>
      ) : null}
    </div>
  )
})
