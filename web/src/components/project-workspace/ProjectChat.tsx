import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProjectDto } from '@/api/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/animate-ui/primitives/animate/tooltip'
import { ChevronDown, Image as ImageIcon, X } from 'lucide-react'

type ChatRole = 'user' | 'agent' | 'system'

type ChatMessageKind = 'text' | 'think'

type ChatImage = {
  id: string
  url: string
  fileName: string
  contentType: string
  sizeBytes: number
}

type ChatMessage = {
  id: string
  role: ChatRole
  kind: ChatMessageKind
  text: string
  images?: ChatImage[]
}

type CodexEventLogItem = {
  receivedAtUtc: string
  method?: string
  raw: string
}

type A2aStatusUpdate = {
  taskId: string
  contextId: string
  final?: boolean
  status?: {
    state?: string
    timestamp?: string
    message?: {
      role?: string
      messageId?: string
      taskId?: string
      contextId?: string
      parts?: unknown[]
    }
  }
}

type A2aArtifactUpdate = {
  taskId: string
  contextId: string
  append?: boolean
  lastChunk?: boolean
  artifact?: {
    artifactId?: string
    name?: string
    parts?: unknown[]
  }
}

type TokenUsageSnapshot = {
  totalTokens?: number
  inputTokens?: number
  cachedInputTokens?: number
  outputTokens?: number
  reasoningOutputTokens?: number
}

type TokenUsageArtifact = {
  total?: TokenUsageSnapshot
  last?: TokenUsageSnapshot
  modelContextWindow?: number
}

function getApiBase(): string {
  return (
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:5210'
  )
}

function randomId(prefix = 'id'): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `${prefix}-${crypto.randomUUID()}`
    }
  } catch {
    // fall back
  }

  return `${prefix}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}

type UploadedImageDto = {
  id: string
  url: string
  fileName: string
  contentType: string
  sizeBytes: number
}

type DraftImage = {
  clientId: string
  url: string
  localObjectUrl: string
  uploadedId: string | null
  fileName: string
  contentType: string
  sizeBytes: number
  status: 'uploading' | 'ready' | 'error'
  error: string | null
}

const maxDraftImages = 8
const maxDraftImageBytes = 10 * 1024 * 1024

async function uploadImage(
  apiBase: string,
  file: File,
  signal?: AbortSignal,
): Promise<UploadedImageDto> {
  const form = new FormData()
  form.append('file', file, file.name || 'image')

  const res = await fetch(`${apiBase}/media/images`, {
    method: 'POST',
    body: form,
    signal,
  })

  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const msg =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message?: unknown }).message ?? '')
        : ''
    throw new Error(msg || `${res.status} ${res.statusText}`)
  }

  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('Upload failed.')
  }

  const first = payload[0] as Partial<UploadedImageDto>
  const id = String(first.id ?? '').trim()
  const url = String(first.url ?? '').trim()
  const fileName = String(first.fileName ?? '').trim()
  const contentType = String(first.contentType ?? '').trim()
  const sizeBytes = Number(first.sizeBytes ?? 0)

  if (!id || !url) {
    throw new Error('Upload failed: missing image id/url.')
  }

  return { id, url, fileName, contentType, sizeBytes }
}

async function* readSseText(response: Response): AsyncGenerator<string, void, unknown> {
  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  let buffer = ''
  let dataLines: string[] = []

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

    let idx = buffer.indexOf('\n')
    while (idx >= 0) {
      const rawLine = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)

      const line = rawLine.replace(/\r$/, '').replace(/^\uFEFF/, '')
      if (!line) {
        if (dataLines.length) {
          yield dataLines.join('\n')
          dataLines = []
        }
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }

      idx = buffer.indexOf('\n')
    }

    if (done) {
      if (dataLines.length) {
        yield dataLines.join('\n')
      }
      break
    }
  }
}

function readPartsText(parts: unknown[] | undefined): string {
  if (!parts?.length) return ''
  const chunks: string[] = []
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue
    const p = part as { text?: unknown }
    if (typeof p.text === 'string' && p.text) chunks.push(p.text)
  }
  return chunks.join('')
}

function safeNumber(value: number | null | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0
}

function formatNumber(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '—'
  return (value as number).toLocaleString()
}

function formatCompactNumber(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '—'

  const abs = Math.abs(value as number)
  if (abs < 1000) return (value as number).toLocaleString()

  try {
    const fmt = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    })
    return fmt.format(value as number)
  } catch {
    const sign = (value as number) < 0 ? '-' : ''

    const stripTrailingZero = (raw: string) => (raw.endsWith('.0') ? raw.slice(0, -2) : raw)

    if (abs < 1_000_000) {
      const n = abs / 1000
      return `${sign}${stripTrailingZero(n.toFixed(1))}K`
    }

    if (abs < 1_000_000_000) {
      const n = abs / 1_000_000
      return `${sign}${stripTrailingZero(n.toFixed(1))}M`
    }

    const n = abs / 1_000_000_000
    return `${sign}${stripTrailingZero(n.toFixed(1))}B`
  }
}

function toTokenUsageSnapshot(value: unknown): TokenUsageSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>

  const snap: TokenUsageSnapshot = {
    totalTokens: typeof obj.totalTokens === 'number' ? obj.totalTokens : undefined,
    inputTokens: typeof obj.inputTokens === 'number' ? obj.inputTokens : undefined,
    cachedInputTokens:
      typeof obj.cachedInputTokens === 'number' ? obj.cachedInputTokens : undefined,
    outputTokens: typeof obj.outputTokens === 'number' ? obj.outputTokens : undefined,
    reasoningOutputTokens:
      typeof obj.reasoningOutputTokens === 'number' ? obj.reasoningOutputTokens : undefined,
  }

  const hasAny =
    Number.isFinite(snap.totalTokens) ||
    Number.isFinite(snap.inputTokens) ||
    Number.isFinite(snap.cachedInputTokens) ||
    Number.isFinite(snap.outputTokens) ||
    Number.isFinite(snap.reasoningOutputTokens)

  return hasAny ? snap : null
}

function normalizeTokenUsageArtifact(value: unknown): TokenUsageArtifact | null {
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>

  const hasEnvelopeKeys =
    'total' in obj || 'last' in obj || 'modelContextWindow' in obj || 'contextWindow' in obj

  if (!hasEnvelopeKeys) {
    const last = toTokenUsageSnapshot(value)
    return last ? { last } : null
  }

  const total = toTokenUsageSnapshot(obj.total)
  const last = toTokenUsageSnapshot(obj.last)

  const contextCandidate = obj.modelContextWindow ?? obj.contextWindow
  const modelContextWindow =
    typeof contextCandidate === 'number' ? contextCandidate : undefined

  if (!total && !last && !Number.isFinite(modelContextWindow)) return null

  return {
    ...(total ? { total } : {}),
    ...(last ? { last } : {}),
    ...(Number.isFinite(modelContextWindow) ? { modelContextWindow } : {}),
  }
}

function getSnapshotTotal(snapshot: TokenUsageSnapshot | undefined): number | null {
  if (!snapshot) return null
  if (Number.isFinite(snapshot.totalTokens)) return snapshot.totalTokens as number

  if (Number.isFinite(snapshot.inputTokens) && Number.isFinite(snapshot.outputTokens)) {
    return safeNumber(snapshot.inputTokens) + safeNumber(snapshot.outputTokens)
  }

  if (Number.isFinite(snapshot.inputTokens)) return snapshot.inputTokens as number
  if (Number.isFinite(snapshot.outputTokens)) return snapshot.outputTokens as number
  return null
}

function TokenUsagePill({ usage }: { usage: TokenUsageArtifact }) {
  const lastTotal = getSnapshotTotal(usage.last ?? undefined)
  const totalTotal = getSnapshotTotal(usage.total ?? undefined)

  const displayTotal = lastTotal ?? totalTotal
  const displayCompact = formatCompactNumber(displayTotal)

  return (
    <Tooltip side="top" sideOffset={8} align="start">
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex cursor-default select-none items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground',
            'hover:bg-accent/50 hover:text-foreground',
          )}
        >
          <span className="text-muted-foreground">Token</span>
          <span className="text-foreground/90">{displayCompact}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent
        className={cn(
          'pointer-events-none max-w-[22rem] rounded-md border border-border/60 bg-popover/95 px-2 py-1.5 text-[11px] text-popover-foreground shadow-lg backdrop-blur-sm',
        )}
      >
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">本次</span>
            <span className="font-medium">{formatNumber(lastTotal ?? undefined)}</span>
          </div>

          {Number.isFinite(totalTotal) ? (
            <div className="flex items-center justify-between gap-6">
              <span className="text-muted-foreground">累计</span>
              <span>{formatNumber(totalTotal ?? undefined)}</span>
            </div>
          ) : null}

          {Number.isFinite(usage.modelContextWindow) ? (
            <div className="flex items-center justify-between gap-6">
              <span className="text-muted-foreground">上下文窗口</span>
              <span>{formatNumber(usage.modelContextWindow ?? undefined)}</span>
            </div>
          ) : null}

          <div className="my-1 h-px bg-border/60" />

          <div className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">输入</span>
            <span>{formatNumber(usage.last?.inputTokens ?? undefined)}</span>
          </div>
          {Number.isFinite(usage.last?.cachedInputTokens) ? (
            <div className="flex items-center justify-between gap-6">
              <span className="text-muted-foreground">缓存输入</span>
              <span>{formatNumber(usage.last?.cachedInputTokens ?? undefined)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">输出</span>
            <span>{formatNumber(usage.last?.outputTokens ?? undefined)}</span>
          </div>
          {Number.isFinite(usage.last?.reasoningOutputTokens) ? (
            <div className="flex items-center justify-between gap-6">
              <span className="text-muted-foreground">思考输出</span>
              <span>{formatNumber(usage.last?.reasoningOutputTokens ?? undefined)}</span>
            </div>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function upsertThinkChunk(
  prev: ChatMessage[],
  thinkMessageId: string,
  agentMessageId: string,
  chunk: string,
): ChatMessage[] {
  const existingIndex = prev.findIndex((m) => m.id === thinkMessageId)
  if (existingIndex >= 0) {
    const next = [...prev]
    const existing = next[existingIndex]
    next[existingIndex] = { ...existing, text: existing.text + chunk }
    return next
  }

  const insertIndex = prev.findIndex((m) => m.id === agentMessageId)
  const next = [...prev]
  const message: ChatMessage = { id: thinkMessageId, role: 'agent', kind: 'think', text: chunk }
  if (insertIndex >= 0) {
    next.splice(insertIndex, 0, message)
  } else {
    next.push(message)
  }
  return next
}

export function ProjectChat({
  project,
  detailsOpen,
  detailsPortalTarget,
  onToolOutput,
}: {
  project: ProjectDto
  detailsOpen: boolean
  detailsPortalTarget: HTMLDivElement | null
  onToolOutput?: (chunk: string) => void
}) {
  const apiBase = useMemo(() => getApiBase(), [])
  const sessionIdRef = useRef<string>(randomId('ctx'))

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [draftImages, setDraftImages] = useState<DraftImage[]>([])
  const [sending, setSending] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [canceling, setCanceling] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const draftImagesRef = useRef<DraftImage[]>([])

  const [thinkOpenById, setThinkOpenById] = useState<Record<string, boolean>>({})
  const [tokenByMessageId, setTokenByMessageId] = useState<Record<string, TokenUsageArtifact>>(
    {},
  )

  const [rawEvents, setRawEvents] = useState<CodexEventLogItem[]>([])

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    draftImagesRef.current = draftImages
  }, [draftImages])

  useEffect(() => {
    return () => {
      for (const img of draftImagesRef.current) {
        if (img.localObjectUrl) {
          try {
            URL.revokeObjectURL(img.localObjectUrl)
          } catch {
            // ignore
          }
        }
      }
    }
  }, [])

  const updateMessageText = useCallback((messageId: string, updater: (prev: string) => string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, text: updater(m.text) } : m)),
    )
  }, [])

  const removeDraftImage = useCallback((clientId: string) => {
    setDraftImages((prev) => {
      const target = prev.find((i) => i.clientId === clientId)
      if (target?.localObjectUrl) {
        try {
          URL.revokeObjectURL(target.localObjectUrl)
        } catch {
          // ignore
        }
      }
      return prev.filter((i) => i.clientId !== clientId)
    })
  }, [])

  const addDraftImages = useCallback(
    (files: File[]) => {
      if (!files.length) return

      setChatError(null)

      setDraftImages((prev) => {
        const slots = Math.max(0, maxDraftImages - prev.length)
        const selected = files.slice(0, slots)
        const next: DraftImage[] = [...prev]

        for (const file of selected) {
          const contentType = (file.type ?? '').trim()
          const isImage = contentType.startsWith('image/')

          const localObjectUrl = isImage ? URL.createObjectURL(file) : ''
          const url = localObjectUrl
          const tooLarge = file.size > maxDraftImageBytes
          const clientId = randomId('img')

          next.push({
            clientId,
            url,
            localObjectUrl,
            uploadedId: null,
            fileName: file.name || 'image',
            contentType,
            sizeBytes: file.size,
            status: tooLarge || !isImage ? 'error' : 'uploading',
            error: tooLarge
              ? `图片过大（最大 ${Math.round(maxDraftImageBytes / 1024 / 1024)}MB）`
              : !isImage
                ? '不是图片文件'
                : null,
          })

          if (!tooLarge && isImage) {
            void (async () => {
              try {
                const uploaded = await uploadImage(apiBase, file)
                setDraftImages((cur) =>
                  cur.map((img) => {
                    if (img.clientId !== clientId) return img
                    if (img.localObjectUrl) {
                      try {
                        URL.revokeObjectURL(img.localObjectUrl)
                      } catch {
                        // ignore
                      }
                    }
                    return {
                      ...img,
                      url: uploaded.url,
                      localObjectUrl: '',
                      uploadedId: uploaded.id,
                      fileName: uploaded.fileName || img.fileName,
                      contentType: uploaded.contentType || img.contentType,
                      sizeBytes: uploaded.sizeBytes || img.sizeBytes,
                      status: 'ready',
                      error: null,
                    }
                  }),
                )
              } catch (e) {
                setDraftImages((cur) =>
                  cur.map((img) =>
                    img.clientId === clientId
                      ? { ...img, status: 'error', error: (e as Error).message }
                      : img,
                  ),
                )
              }
            })()
          }
        }

        return next
      })
    },
    [apiBase],
  )

  const send = useCallback(async () => {
    const text = draft.trim()
    const hasBlockingUploads = draftImages.some((img) => img.status !== 'ready')
    const readyImages: ChatImage[] = draftImages
      .filter((img) => img.status === 'ready' && img.uploadedId)
      .map((img) => ({
        id: img.uploadedId as string,
        url: img.url,
        fileName: img.fileName,
        contentType: img.contentType,
        sizeBytes: img.sizeBytes,
      }))

    if (sending) return
    if ((!text && readyImages.length === 0) || hasBlockingUploads) return

    setChatError(null)
    setDraft('')
    setDraftImages([])
    setRawEvents([])

    const taskId = randomId('task')
    const userMessageId = `msg-user-${taskId}`
    const thinkMessageId = `msg-think-${taskId}`
    const agentMessageId = `msg-agent-${taskId}`

    setMessages((prev) => [
      ...prev,
      {
        id: userMessageId,
        role: 'user',
        kind: 'text',
        text,
        ...(readyImages.length ? { images: readyImages } : {}),
      },
      { id: agentMessageId, role: 'agent', kind: 'text', text: '' },
    ])

    setSending(true)
    setActiveTaskId(taskId)
    setCanceling(false)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const imageParts = readyImages.map((img) => ({
        kind: 'image',
        id: img.id,
        url: img.url,
        fileName: img.fileName,
        contentType: img.contentType,
        sizeBytes: img.sizeBytes,
      }))

      const request = {
        jsonrpc: '2.0',
        id: randomId('req'),
        method: 'tasks/sendSubscribe',
        params: {
          cwd: project.workspacePath,
          contextId: sessionIdRef.current,
          taskId,
          message: {
            role: 'user',
            messageId: userMessageId,
            contextId: sessionIdRef.current,
            taskId,
            parts: [...(text ? [{ text }] : []), ...imageParts],
          },
        },
      }

      const res = await fetch(`${apiBase}/a2a`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(errText || `${res.status} ${res.statusText}`)
      }

      for await (const data of readSseText(res)) {
        if (!data) continue

        let payload: unknown
        try {
          payload = JSON.parse(data)
        } catch {
          continue
        }

        if (!payload || typeof payload !== 'object') continue
        const envelope = payload as { error?: unknown; result?: unknown }

        if (envelope.error) {
          const message =
            typeof envelope.error === 'object' && envelope.error
              ? (envelope.error as { message?: unknown }).message
              : undefined
          throw new Error(typeof message === 'string' ? message : 'A2A error')
        }

        const result = envelope.result ?? null
        if (!result) continue

        if (typeof result !== 'object') continue
        const resultObj = result as {
          statusUpdate?: unknown
          artifactUpdate?: unknown
        }

        const statusUpdate = (resultObj.statusUpdate ?? null) as A2aStatusUpdate | null
        if (statusUpdate?.status?.message?.messageId) {
          const messageId = statusUpdate.status.message.messageId
          const parts = statusUpdate.status.message.parts as unknown[] | undefined
          const chunk = readPartsText(parts)

          if (messageId === agentMessageId && chunk) {
            if (statusUpdate.final) {
              updateMessageText(agentMessageId, () => chunk)
            } else {
              updateMessageText(agentMessageId, (prev) => prev + chunk)
            }
          }

          if (statusUpdate.final) {
            setSending(false)
            setActiveTaskId(null)
            setCanceling(false)
          }
        }

        const artifactUpdate = (resultObj.artifactUpdate ?? null) as A2aArtifactUpdate | null
        const artifact = artifactUpdate?.artifact
        const artifactName = artifact?.name ?? ''

        if (artifactName === 'tool-output') {
          const parts = (artifact?.parts ?? []) as unknown[]
          const chunk = readPartsText(parts)
          if (chunk) {
            onToolOutput?.(chunk)
          }
          continue
        }

        if (artifactName === 'reasoning') {
          const parts = (artifact?.parts ?? []) as unknown[]
          const chunk = readPartsText(parts)
          if (chunk) {
            setMessages((prev) => upsertThinkChunk(prev, thinkMessageId, agentMessageId, chunk))
            setThinkOpenById((prev) =>
              prev[thinkMessageId] !== undefined ? prev : { ...prev, [thinkMessageId]: true },
            )
          }
          continue
        }

        if (artifactName === 'token-usage') {
          const parts = (artifact?.parts ?? []) as unknown[]
          for (const part of parts) {
            if (!part || typeof part !== 'object') continue
            const dataValue = (part as { data?: unknown }).data
            const normalized = normalizeTokenUsageArtifact(dataValue)
            if (!normalized) continue
            setTokenByMessageId((prev) => ({
              ...prev,
              [agentMessageId]: normalized,
            }))
            break
          }
          continue
        }

        if (artifactName === 'codex-events') {
          const parts = (artifact?.parts ?? []) as unknown[]
          for (const part of parts) {
            if (!part || typeof part !== 'object') continue
            const dataValue = (part as { data?: unknown }).data
            if (!dataValue || typeof dataValue !== 'object') continue

            const dataObj = dataValue as {
              receivedAtUtc?: unknown
              method?: unknown
              raw?: unknown
            }

            const receivedAtUtc = String(dataObj.receivedAtUtc ?? '')
            const method = typeof dataObj.method === 'string' ? dataObj.method : undefined
            const raw = typeof dataObj.raw === 'string' ? dataObj.raw : ''
            if (!raw) continue
            setRawEvents((prev) => [...prev, { receivedAtUtc, method, raw }])
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setChatError((e as Error).message)
      }
      setSending(false)
      setActiveTaskId(null)
      setCanceling(false)
    }
  }, [apiBase, draft, draftImages, onToolOutput, project.workspacePath, sending, updateMessageText])

  const cancel = useCallback(async () => {
    if (!activeTaskId || !sending || canceling) return
    setCanceling(true)
    setChatError(null)

    try {
      const request = {
        jsonrpc: '2.0',
        id: randomId('req'),
        method: 'tasks/cancel',
        params: {
          id: activeTaskId,
        },
      }

      const res = await fetch(`${apiBase}/a2a`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(request),
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        const errText = typeof payload === 'string' ? payload : null
        throw new Error(errText || `${res.status} ${res.statusText}`)
      }

      if (payload?.error) {
        throw new Error(payload?.error?.message ?? '取消失败')
      }
    } catch (e) {
      setChatError((e as Error).message)
      setCanceling(false)
    }
  }, [activeTaskId, apiBase, canceling, sending])

  return (
    <TooltipProvider openDelay={120} closeDelay={60}>
      <>
        <section className="relative min-w-0 flex-1 overflow-hidden flex flex-col">
          {chatError ? (
            <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {chatError}
            </div>
          ) : null}

          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 pt-6 pb-40">
            {messages.length ? null : (
              <div className="flex h-full min-h-[160px] items-center justify-center text-center">
                <div className="max-w-sm text-sm text-muted-foreground">
                  在这里开始对话：输入问题或指令。
                </div>
              </div>
            )}

            <div className="space-y-2">
              {messages.map((m) => {
                const isActiveAgentMessage =
                  Boolean(sending && activeTaskId) && m.id === `msg-agent-${activeTaskId}`
                const isActiveThinkMessage =
                  Boolean(sending && activeTaskId) && m.id === `msg-think-${activeTaskId}`

                const align = m.role === 'user' ? 'justify-end' : 'justify-start'

                if (m.kind === 'think') {
                  const open = thinkOpenById[m.id] ?? isActiveThinkMessage
                  return (
                    <div key={m.id} className={cn('mx-auto flex w-full max-w-3xl py-1', align)}>
                      <div className="max-w-[80%] overflow-hidden rounded-lg border bg-muted/30 text-foreground">
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-center justify-between gap-3 px-3 py-2 text-xs font-medium text-muted-foreground',
                            'hover:bg-accent/40',
                          )}
                          onClick={() => {
                            setThinkOpenById((prev) => ({
                              ...prev,
                              [m.id]: !(prev[m.id] ?? isActiveThinkMessage),
                            }))
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <span>思考</span>
                            {isActiveThinkMessage && !m.text ? (
                              <span className="inline-flex items-center gap-1">
                                <Spinner className="size-3" />
                                <span>生成中</span>
                              </span>
                            ) : null}
                          </span>
                          <ChevronDown
                            className={cn(
                              'size-4 shrink-0 transition-transform',
                              open ? 'rotate-0' : '-rotate-90',
                            )}
                          />
                        </button>

                        {open ? (
                          <pre className="px-3 pb-3 text-xs whitespace-pre-wrap break-words">
                            {m.text}
                          </pre>
                        ) : null}
                      </div>
                    </div>
                  )
                }

                const tokenUsage = m.role === 'agent' ? tokenByMessageId[m.id] : undefined
                const showBubble =
                  Boolean(m.text) || (m.role === 'agent' && isActiveAgentMessage)

                return (
                  <div key={m.id} className={cn('mx-auto flex w-full max-w-3xl py-1', align)}>
                    <div className="max-w-[80%]">
                      {showBubble ? (
                        <div
                          className={cn(
                            'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
                            m.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : m.role === 'agent'
                                ? 'bg-muted text-foreground'
                                : 'bg-accent text-accent-foreground',
                          )}
                        >
                          {m.text ? (
                            m.text
                          ) : m.role === 'agent' && isActiveAgentMessage ? (
                            <span className="inline-flex items-center">
                              <Spinner />
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {m.images?.length ? (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {m.images.map((img) => (
                            <a
                              key={img.id}
                              href={img.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block overflow-hidden rounded-md border bg-background/30"
                              title={img.fileName || 'image'}
                            >
                              <img
                                src={img.url}
                                alt={img.fileName || ''}
                                className="block h-auto w-full max-h-[260px] object-contain"
                                loading="lazy"
                              />
                            </a>
                          ))}
                        </div>
                      ) : null}

                      {tokenUsage ? (
                        <div className={cn('mt-1', align === 'justify-end' ? 'text-right' : '')}>
                          <TokenUsagePill usage={tokenUsage} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-card via-card/80 to-transparent px-4 pb-4 pt-10">
            <div className="pointer-events-auto mx-auto max-w-3xl">
              <div className="rounded-2xl border bg-background/80 p-2 shadow-lg backdrop-blur">
                <div className="space-y-2">
                  {draftImages.length ? (
                    <div className="flex flex-wrap gap-2 px-1">
                      {draftImages.map((img) => (
                        <div
                          key={img.clientId}
                          className={cn(
                            'relative size-20 overflow-hidden rounded-md border bg-background/30',
                            img.status === 'error' ? 'border-destructive' : '',
                          )}
                        >
                          {img.url ? (
                            <img
                              src={img.url}
                              alt={img.fileName}
                              className="h-full w-full object-cover"
                              draggable={false}
                            />
                          ) : null}

                          <button
                            type="button"
                            className={cn(
                              'absolute right-1 top-1 rounded-sm bg-background/70 p-1 text-muted-foreground',
                              'hover:bg-background hover:text-foreground',
                            )}
                            onClick={() => removeDraftImage(img.clientId)}
                            title="移除"
                          >
                            <X className="size-3" />
                          </button>

                          {img.status === 'uploading' ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                              <Spinner />
                            </div>
                          ) : null}

                          {img.status === 'error' && img.error ? (
                            <div className="absolute inset-x-0 bottom-0 bg-destructive/80 px-1 py-0.5 text-[10px] text-white">
                              {img.error}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex items-end gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={sending}
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? [])
                        e.target.value = ''
                        addDraftImages(files)
                      }}
                    />

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={sending || draftImages.length >= maxDraftImages}
                      onClick={() => fileInputRef.current?.click()}
                      title="上传图片"
                    >
                      <ImageIcon className="size-4" />
                      <span className="sr-only">上传图片</span>
                    </Button>

                  <textarea
                    className="min-h-[44px] max-h-[180px] w-full flex-1 resize-none rounded-xl bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
                    placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                    value={draft}
                    disabled={sending}
                    onChange={(e) => setDraft(e.target.value)}
                    onPaste={(e) => {
                      const items = Array.from(e.clipboardData?.items ?? [])
                      const imageFiles = items
                        .filter((i) => i.type.startsWith('image/'))
                        .map((i) => i.getAsFile())
                        .filter(Boolean) as File[]

                      if (imageFiles.length) {
                        e.preventDefault()
                        addDraftImages(imageFiles)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void send()
                      }
                    }}
                  />
                  {sending ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void cancel()}
                      disabled={canceling}
                    >
                      {canceling ? '停止中…' : '停止'}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => void send()}
                      disabled={
                        (!draft.trim() &&
                          draftImages.filter((img) => img.status === 'ready').length === 0) ||
                        draftImages.some((img) => img.status !== 'ready')
                      }
                    >
                      发送
                    </Button>
                  )}
                </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {detailsOpen && detailsPortalTarget
          ? createPortal(
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm">Raw Events</div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!rawEvents.length}
                      onClick={() => setRawEvents([])}
                    >
                      清空
                    </Button>
                  </div>
                  <div className="mt-2 space-y-2">
                    {rawEvents.length ? null : (
                      <div className="text-xs text-muted-foreground">（无）</div>
                    )}
                    {rawEvents.map((e, idx) => (
                      <div key={`${e.receivedAtUtc}-${idx}`} className="rounded-md border bg-background p-2">
                        <div className="truncate text-[11px] text-muted-foreground">
                          {e.receivedAtUtc} {e.method ?? ''}
                        </div>
                        <pre className="mt-1 max-h-[160px] overflow-auto whitespace-pre-wrap text-[11px]">
                          {e.raw}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              </div>,
              detailsPortalTarget,
            )
          : null}
      </>
    </TooltipProvider>
  )
}
