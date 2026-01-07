import { memo } from 'react'

interface ToolOutputContentProps {
  output: string
}

export const ToolOutputContent = memo(function ToolOutputContent({ output }: ToolOutputContentProps) {
  if (!output) return null

  return (
    <details className="rounded-md border bg-background/50">
      <summary className="cursor-pointer px-2 py-1 text-[11px] text-muted-foreground">
        Output
      </summary>
      <pre className="max-h-[240px] overflow-auto px-2 pb-2 text-[11px] whitespace-pre-wrap break-words">
        {output}
      </pre>
    </details>
  )
})
