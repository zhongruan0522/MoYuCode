import { create } from 'zustand'

type ChatRole = 'user' | 'agent' | 'system'
type ChatMessageKind = 'text' | 'think' | 'tool'

type ChatImage = {
  id: string
  url: string
  fileName: string
  contentType: string
  sizeBytes: number
}

export type ChatMessage = {
  id: string
  role: ChatRole
  kind: ChatMessageKind
  text: string
  images?: ChatImage[]
  toolName?: string
  toolUseId?: string
  toolInput?: string
  toolOutput?: string
  toolIsError?: boolean
}

type TokenUsageSnapshot = {
  totalTokens?: number
  inputTokens?: number
  cachedInputTokens?: number
  outputTokens?: number
  reasoningOutputTokens?: number
}

export type TokenUsageArtifact = {
  total?: TokenUsageSnapshot
  last?: TokenUsageSnapshot
  modelContextWindow?: number
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

type MentionedFile = {
  fullPath: string
  relativePath: string
  baseName: string
  iconUrl: string | null
}

type CodexEventLogItem = {
  receivedAtUtc: string
  method?: string
  raw: string
}

export type ProjectChatState = {
  messages: ChatMessage[]
  draft: string
  draftImages: DraftImage[]
  thinkOpenById: Record<string, boolean>
  toolOpenById: Record<string, boolean>
  tokenByMessageId: Record<string, TokenUsageArtifact>
  rawEvents: CodexEventLogItem[]
  toolOutput: string
  mentionedFiles: MentionedFile[]
  includeActiveFileInPrompt: boolean
  todoDockOpen: boolean
  scrollTop: number
  // 活跃请求状态
  sending: boolean
  activeTaskId: string | null
  activeReasoningMessageId: string | null
}

// 活跃请求的运行时状态（不持久化）
type ActiveRequestState = {
  abortController: AbortController | null
  eventSource: EventSource | null
}

const defaultState: ProjectChatState = {
  messages: [],
  draft: '',
  draftImages: [],
  thinkOpenById: {},
  toolOpenById: {},
  tokenByMessageId: {},
  rawEvents: [],
  toolOutput: '',
  mentionedFiles: [],
  includeActiveFileInPrompt: true,
  todoDockOpen: false,
  scrollTop: 0,
  sending: false,
  activeTaskId: null,
  activeReasoningMessageId: null,
}

type ProjectChatStore = {
  stateByProjectId: Record<string, ProjectChatState>
  activeRequestByProjectId: Record<string, ActiveRequestState>
  getState: (projectId: string) => ProjectChatState
  setState: (projectId: string, state: Partial<ProjectChatState>) => void
  clearState: (projectId: string) => void
  // 活跃请求管理
  setActiveRequest: (projectId: string, request: ActiveRequestState) => void
  getActiveRequest: (projectId: string) => ActiveRequestState | null
  clearActiveRequest: (projectId: string) => void
}

export const useProjectChatStore = create<ProjectChatStore>((set, get) => ({
  stateByProjectId: {},
  activeRequestByProjectId: {},

  getState: (projectId: string) => {
    const existing = get().stateByProjectId[projectId]
    if (existing) return existing
    return { ...defaultState }
  },

  setState: (projectId: string, state: Partial<ProjectChatState>) => {
    set((prev) => ({
      stateByProjectId: {
        ...prev.stateByProjectId,
        [projectId]: {
          ...defaultState,
          ...prev.stateByProjectId[projectId],
          ...state,
        },
      },
    }))
  },

  clearState: (projectId: string) => {
    set((prev) => {
      const next = { ...prev.stateByProjectId }
      delete next[projectId]
      return { stateByProjectId: next }
    })
  },

  setActiveRequest: (projectId: string, request: ActiveRequestState) => {
    set((prev) => ({
      activeRequestByProjectId: {
        ...prev.activeRequestByProjectId,
        [projectId]: request,
      },
    }))
  },

  getActiveRequest: (projectId: string) => {
    return get().activeRequestByProjectId[projectId] ?? null
  },

  clearActiveRequest: (projectId: string) => {
    set((prev) => {
      const next = { ...prev.activeRequestByProjectId }
      delete next[projectId]
      return { activeRequestByProjectId: next }
    })
  },
}))

export function createDefaultChatState(): ProjectChatState {
  return { ...defaultState }
}
