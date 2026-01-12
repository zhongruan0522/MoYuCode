import { memo, useMemo } from 'react'
import { Search } from 'lucide-react'
import type { GrepToolInput } from '@/lib/toolInputParsers'

interface GrepToolContentProps {
  input: GrepToolInput
  output: string
}

interface GrepOutput {
  mode?: string
  filenames?: string[]
  numFiles?: number
}

export const GrepToolContent = memo(function GrepToolContent({ input, output }: GrepToolContentProps) {
  const parsedOutput = useMemo<GrepOutput | null>(() => {
    if (!output) return null
    try {
      const parsed = JSON.parse(output)
      if (parsed && typeof parsed === 'object') {
        return parsed as GrepOutput
      }
      return null
    } catch {
      return null
    }
  }, [output])

  const files = parsedOutput?.filenames ?? []
  const numFiles = parsedOutput?.numFiles ?? files.length

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">Grep</span>
        </div>
        <div className="flex-1 font-mono text-sm">{input.pattern}</div>
      </div>
      {input.path && (
        <div className="text-xs text-muted-foreground">
          Path: {input.path}
        </div>
      )}
      {input.glob && (
        <div className="text-xs text-muted-foreground">
          Glob: {input.glob}
        </div>
      )}
      {numFiles > 0 && (
        <div className="text-xs text-muted-foreground">
          Found {numFiles} file{numFiles === 1 ? '' : 's'}
        </div>
      )}
      {files.length > 0 && (
        <div className="max-h-[240px] overflow-y-auto rounded-md border bg-background p-2">
          <div className="space-y-1">
            {files.map((file, index) => (
              <div key={index} className="font-mono text-xs text-foreground/90">
                {file}
              </div>
            ))}
          </div>
        </div>
      )}
      {!parsedOutput && output && (
        <div className="max-h-[240px] overflow-y-auto rounded-md border bg-background p-2">
          <pre className="font-mono text-xs text-foreground/90 whitespace-pre-wrap">{output}</pre>
        </div>
      )}
    </div>
  )
})
