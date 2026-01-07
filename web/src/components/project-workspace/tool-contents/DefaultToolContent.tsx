import { memo } from 'react'

interface DefaultToolContentProps {
  input: string
}

export const DefaultToolContent = memo(function DefaultToolContent({ input }: DefaultToolContentProps) {
  if (!input) return null

  return (
    <details className="rounded-md border bg-background/50">
      <summary className="cursor-pointer px-2 py-1 text-[11px] text-muted-foreground">
        Input
      </summary>
      <pre className="px-2 pb-2 text-[11px] whitespace-pre-wrap break-words">{input}</pre>
    </details>
  )
})
