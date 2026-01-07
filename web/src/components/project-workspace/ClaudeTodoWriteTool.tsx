import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import type { TodoWriteToolInput } from '@/components/project-workspace/tool-inputs/todoType'

export interface ClaudeTodoWriteToolProps {
  input: TodoWriteToolInput
  showHeader?: boolean
  showActiveForm?: boolean
}

export const ClaudeTodoWriteTool = memo(function ClaudeTodoWriteTool({
  input,
  showHeader = true,
  showActiveForm = true,
}: ClaudeTodoWriteToolProps) {
  const todos = input.todos

  return (
    <div className="space-y-2">
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-medium text-muted-foreground">Todo</div>
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            {todos.length} item{todos.length === 1 ? '' : 's'}
          </Badge>
        </div>
      ) : null}

      {todos.length ? (
        <div className="max-h-[240px] overflow-auto rounded-md border bg-background/60">
          <div className="space-y-1 p-2">
            {todos.map((todo, idx) => {
              const statusClass =
                todo.status === 'completed'
                  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                  : todo.status === 'in_progress'
                    ? 'bg-sky-500/15 text-sky-300 ring-sky-500/30'
                    : 'bg-muted/40 text-muted-foreground ring-border/60'

              const statusIcon =
                todo.status === 'completed' ? (
                  <Check className="size-4 text-emerald-400" />
                ) : todo.status === 'in_progress' ? (
                  <Spinner className="size-3 text-sky-300" />
                ) : (
                  <span className="size-2 rounded-full bg-muted-foreground/60" />
                )

              return (
                <div
                  key={`${todo.content}-${idx}`}
                  className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-accent/40"
                >
                  <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center">
                    {statusIcon}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-snug">{todo.content}</div>
                    {showActiveForm && todo.activeForm && todo.activeForm !== todo.content ? (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{todo.activeForm}</div>
                    ) : null}
                  </div>

                  <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] ring-1', statusClass)}>
                    {todo.status}
                  </Badge>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">（无 todo）</div>
      )}
    </div>
  )
})
