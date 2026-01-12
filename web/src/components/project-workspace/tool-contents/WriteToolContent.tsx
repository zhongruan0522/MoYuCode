import { memo } from 'react'
import { MonacoCode } from '@/components/MonacoCode'
import type { WriteToolInput } from '@/lib/toolInputParsers'

interface WriteToolContentProps {
  input: WriteToolInput
}

export const WriteToolContent = memo(function WriteToolContent({ input }: WriteToolContentProps) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground">Write</div>
      <div className="break-all text-[11px] text-muted-foreground">{input.filePath}</div>
      <div style={{
        minWidth:'380px'
      }} className="h-[240px] overflow-hidden rounded-md border bg-background">
        <MonacoCode code={input.content} filePath={input.filePath} className="h-full" />
      </div>
    </div>
  )
})
