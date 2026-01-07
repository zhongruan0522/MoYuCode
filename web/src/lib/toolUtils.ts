function normalizeNewlines(value: string): string {
  return (value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function truncateInlineText(value: string, maxChars = 140): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) return normalized
  return normalized.slice(0, Math.max(0, maxChars - 1)) + '…'
}

function getBaseName(fullPath: string): string {
  const normalized = fullPath.replace(/[\\/]+$/, '')
  const lastSeparator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (lastSeparator < 0) return normalized
  const base = normalized.slice(lastSeparator + 1)
  return base || normalized
}

type ReplacementLineDiffOp = { type: 'equal' | 'add' | 'del'; text: string }

function splitTextLinesForDiff(value: string): string[] {
  const normalized = normalizeNewlines(value ?? '')
  if (!normalized) return []

  const withoutFinalNewline = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  if (!withoutFinalNewline) return []

  return withoutFinalNewline.split('\n')
}

function backtrackMyersDiff(
  trace: number[][],
  oldLines: string[],
  newLines: string[],
  offset: number,
): ReplacementLineDiffOp[] {
  let x = oldLines.length
  let y = newLines.length
  const ops: ReplacementLineDiffOp[] = []

  for (let d = trace.length - 1; d > 0; d -= 1) {
    const vPrev = trace[d - 1]
    const k = x - y

    const prevK =
      k === -d || (k !== d && (vPrev[k - 1 + offset] ?? 0) < (vPrev[k + 1 + offset] ?? 0))
        ? k + 1
        : k - 1

    const prevX = vPrev[prevK + offset] ?? 0
    const prevY = prevX - prevK

    while (x > prevX && y > prevY) {
      ops.push({ type: 'equal', text: oldLines[x - 1] ?? '' })
      x -= 1
      y -= 1
    }

    if (x === prevX) {
      ops.push({ type: 'add', text: newLines[y - 1] ?? '' })
      y -= 1
    } else {
      ops.push({ type: 'del', text: oldLines[x - 1] ?? '' })
      x -= 1
    }
  }

  while (x > 0 && y > 0) {
    ops.push({ type: 'equal', text: oldLines[x - 1] ?? '' })
    x -= 1
    y -= 1
  }

  while (x > 0) {
    ops.push({ type: 'del', text: oldLines[x - 1] ?? '' })
    x -= 1
  }

  while (y > 0) {
    ops.push({ type: 'add', text: newLines[y - 1] ?? '' })
    y -= 1
  }

  return ops.reverse()
}

function computeMyersLineDiff(oldLines: string[], newLines: string[]): ReplacementLineDiffOp[] {
  const n = oldLines.length
  const m = newLines.length
  const max = n + m
  const offset = max

  const v = new Array<number>(2 * max + 1).fill(0)
  const trace: number[][] = []

  for (let d = 0; d <= max; d += 1) {
    const nextV = v.slice()

    for (let k = -d; k <= d; k += 2) {
      const kIndex = k + offset

      let x: number
      if (k === -d || (k !== d && v[k + 1 + offset] > v[k - 1 + offset])) {
        x = v[k + 1 + offset]
      } else {
        x = v[k - 1 + offset] + 1
      }

      let y = x - k

      while (x < n && y < m && oldLines[x] === newLines[y]) {
        x += 1
        y += 1
      }

      nextV[kIndex] = x

      if (x >= n && y >= m) {
        trace.push(nextV)
        return backtrackMyersDiff(trace, oldLines, newLines, offset)
      }
    }

    trace.push(nextV)
    for (let i = 0; i < nextV.length; i += 1) v[i] = nextV[i]
  }

  return backtrackMyersDiff(trace, oldLines, newLines, offset)
}

function computeReplacementDiffStats(oldString: string, newString: string): { added: number; removed: number } {
  const oldLines = splitTextLinesForDiff(oldString)
  const newLines = splitTextLinesForDiff(newString)
  const ops = computeMyersLineDiff(oldLines, newLines)

  let added = 0
  let removed = 0
  for (const op of ops) {
    if (op.type === 'add') added += 1
    else if (op.type === 'del') removed += 1
  }

  return { added, removed }
}

function buildReplacementDiff(filePath: string, oldString: string, newString: string): string {
  const path = (filePath ?? '').replace(/\\/g, '/')
  const oldLines = splitTextLinesForDiff(oldString)
  const newLines = splitTextLinesForDiff(newString)

  const ops = computeMyersLineDiff(oldLines, newLines).filter((op) => op.type !== 'equal')
  if (!ops.length) return ''

  const oldCount = Math.max(1, oldLines.length)
  const newCount = Math.max(1, newLines.length)

  const hunk = `@@ -1,${oldCount} +1,${newCount} @@`

  const body = ops
    .map((op) => `${op.type === 'add' ? '+' : '-'}${op.text}`)
    .join('\n')

  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${hunk}\n${body}`
}

function tryExtractReadToolOutput(output: string): string | null {
  const trimmed = (output ?? '').trim()
  if (!trimmed) return null
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null

  const parsed = tryParseJsonValue(trimmed)
  if (!parsed) return null

  const extract = (value: unknown): { filePath?: string; content: string } | null => {
    if (value == null) return null

    if (typeof value === 'string') {
      const nestedTrimmed = value.trim()
      if (nestedTrimmed.startsWith('{') || nestedTrimmed.startsWith('[')) {
        const nested = tryParseJsonValue(nestedTrimmed)
        const nestedExtracted = nested ? extract(nested) : null
        if (nestedExtracted) return nestedExtracted
      }
      return { content: value }
    }

    if (Array.isArray(value)) {
      const parts: string[] = []
      for (const entry of value) {
        const extracted = extract(entry)
        if (!extracted) continue
        if (extracted.content) parts.push(extracted.content)
      }
      const joined = parts.join('\n').trimEnd()
      return joined ? { content: joined } : null
    }

    if (typeof value !== 'object') return null
    const obj = value as Record<string, unknown>

    const fileValue = obj.file
    if (fileValue && typeof fileValue === 'object' && !Array.isArray(fileValue)) {
      const fileObj = fileValue as Record<string, unknown>
      const content = typeof fileObj.content === 'string' ? fileObj.content : null
      if (content != null) {
        const filePath =
          (typeof fileObj.filePath === 'string' ? fileObj.filePath : undefined) ??
          (typeof fileObj.file_path === 'string' ? fileObj.file_path : undefined)
        return { filePath, content }
      }
    }

    const contentValue = obj.content
    if (typeof contentValue === 'string') return { content: contentValue }

    const textValue = obj.text
    if (typeof textValue === 'string') {
      const nestedTrimmed = textValue.trim()
      if (nestedTrimmed.startsWith('{') || nestedTrimmed.startsWith('[')) {
        const nested = tryParseJsonValue(nestedTrimmed)
        const nestedExtracted = nested ? extract(nested) : null
        if (nestedExtracted) return nestedExtracted
      }
      return { content: textValue }
    }

    const dataValue = obj.data
    if (dataValue) return extract(dataValue)

    return null
  }

  const extracted = extract(parsed)
  if (!extracted?.content) return null
  return extracted.content
}

function tryParseJsonValue(value: string): unknown | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

function normalizeReadToolOutputForMonaco(output: string): string {
  const normalized = normalizeNewlines(output ?? '')
  if (!normalized) return ''

  const lines = normalized.split('\n')
  if (lines.length < 2) return normalized

  const patterns: RegExp[] = [
    /^\s*(\d+)\t(.*)$/,
    /^\s*(\d+)\s*->\s?(.*)$/,
    /^\s*(\d+)\s*→\s?(.*)$/,
  ]

  for (const pattern of patterns) {
    const matches = lines.map((line) => pattern.exec(line))
    const matchedCount = matches.reduce((acc, m) => acc + (m ? 1 : 0), 0)
    if (matchedCount < Math.max(2, Math.floor(lines.length * 0.8))) continue

    let numCount = 0
    let seqCount = 0
    let prevNum: number | null = null
    for (const match of matches) {
      if (!match) continue
      const num = Number(match[1])
      if (!Number.isFinite(num)) continue
      if (prevNum != null && num === prevNum + 1) seqCount += 1
      prevNum = num
      numCount += 1
    }

    if (numCount > 2 && seqCount < Math.floor((numCount - 1) * 0.6)) continue

    return matches.map((m, idx) => (m ? m[2] : lines[idx])).join('\n')
  }

  return normalized
}

export {
  normalizeNewlines,
  truncateInlineText,
  getBaseName,
  computeReplacementDiffStats,
  buildReplacementDiff,
  tryExtractReadToolOutput,
  normalizeReadToolOutputForMonaco,
}
