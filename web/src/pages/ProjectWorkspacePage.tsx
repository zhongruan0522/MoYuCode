import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '@/api/client'
import type {
  DirectoryEntryDto,
  FileEntryDto,
  ListEntriesResponse,
  ProjectDto,
} from '@/api/types'
import {
  FileItem,
  Files,
  FolderContent,
  FolderItem,
  FolderTrigger,
  SubFiles,
} from '@animate-ui/components-base-files'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
} from '@assistant-ui/react'
import type { ChatModelAdapter, ChatModelRunOptions } from '@assistant-ui/react'
import { Button } from '@/components/ui/button'

function ChatUserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap break-words">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  )
}

function ChatAssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div className="max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground whitespace-pre-wrap break-words">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  )
}

function ProjectChatPanel({ project }: { project: ProjectDto }) {
  const projectRef = useRef(project)
  useEffect(() => {
    projectRef.current = project
  }, [project])

  const adapter = useMemo<ChatModelAdapter>(() => {
    return {
      async run(options: ChatModelRunOptions) {
        const lastUser = [...options.messages].reverse().find((m) => m.role === 'user') as
          | { content?: readonly { type: string; text?: string }[] }
          | undefined

        const text =
          lastUser?.content
            ?.filter((p) => p.type === 'text')
            .map((p) => p.text ?? '')
            .join('') ?? ''

        const p = projectRef.current
        const reply = text.trim()
          ? `收到：${text.trim()}\n\n（当前仅接入对话 UI：${p.name}）`
          : `当前项目：${p.name}\n工作空间：${p.workspacePath}\n\n可以在这里开始对话。`

        return {
          content: [{ type: 'text', text: reply }],
          status: { type: 'complete', reason: 'stop' },
        }
      },
    }
  }, [])

  const runtime = useLocalRuntime(adapter)

  const messageComponents = useMemo(() => {
    return { UserMessage: ChatUserMessage, AssistantMessage: ChatAssistantMessage }
  }, [])

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="h-full min-h-0">
        <ThreadPrimitive.Viewport className="h-full min-h-0 overflow-y-auto px-4 pt-4 pb-0">
          <ThreadPrimitive.Empty>
            <div className="text-sm text-muted-foreground">
              开始对话吧：输入问题或指令。
            </div>
          </ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages components={messageComponents} />

          <ThreadPrimitive.ViewportFooter className="-mx-4 sticky bottom-0 z-10 border-t bg-background/90 px-4 py-3 backdrop-blur">
            <div className="mx-auto max-w-3xl">
              <div className="rounded-xl border bg-card/60 p-2 shadow-sm">
                <ComposerPrimitive.Root className="flex items-end gap-2">
                  <ComposerPrimitive.Input
                    className="min-h-[44px] max-h-[180px] w-full flex-1 resize-none rounded-lg bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
                    placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                  />
                  <ComposerPrimitive.Send className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
                    发送
                  </ComposerPrimitive.Send>
                </ComposerPrimitive.Root>
              </div>
            </div>
          </ThreadPrimitive.ViewportFooter>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

export function ProjectWorkspacePage() {
  const { id } = useParams()
  const [project, setProject] = useState<ProjectDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.projects.get(id)
      setProject(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])

  const inFlightRef = useRef<Set<string>>(new Set())
  const [entriesByPath, setEntriesByPath] = useState<
    Record<string, Pick<ListEntriesResponse, 'directories' | 'files'>>
  >({})
  const entriesByPathRef = useRef(entriesByPath)
  const [nodeLoadingByPath, setNodeLoadingByPath] = useState<Record<string, boolean>>({})
  const [nodeErrorByPath, setNodeErrorByPath] = useState<Record<string, string | null>>({})

  useEffect(() => {
    entriesByPathRef.current = entriesByPath
  }, [entriesByPath])

  const resetEntries = useCallback(() => {
    inFlightRef.current.clear()
    setEntriesByPath({})
    entriesByPathRef.current = {}
    setNodeLoadingByPath({})
    setNodeErrorByPath({})
  }, [])

  const ensureEntries = useCallback(
    async (path: string) => {
      const normalizedPath = path.trim()
      if (!normalizedPath) return
      if (entriesByPathRef.current[normalizedPath]) return
      if (inFlightRef.current.has(normalizedPath)) return

      inFlightRef.current.add(normalizedPath)
      setNodeLoadingByPath((s) => ({ ...s, [normalizedPath]: true }))
      setNodeErrorByPath((s) => ({ ...s, [normalizedPath]: null }))
      try {
        const data = await api.fs.listEntries(normalizedPath)
        setEntriesByPath((s) => {
          const next = {
            ...s,
            [normalizedPath]: { directories: data.directories, files: data.files },
            [data.currentPath]: { directories: data.directories, files: data.files },
          }
          entriesByPathRef.current = next
          return next
        })
      } catch (e) {
        setNodeErrorByPath((s) => ({ ...s, [normalizedPath]: (e as Error).message }))
      } finally {
        inFlightRef.current.delete(normalizedPath)
        setNodeLoadingByPath((s) => ({ ...s, [normalizedPath]: false }))
      }
    },
    [],
  )

  useEffect(() => {
    resetEntries()
    if (!project?.workspacePath) return
    void ensureEntries(project.workspacePath)
  }, [ensureEntries, project?.workspacePath, resetEntries])

  useEffect(() => {
    void load()
  }, [load])

  const rootPath = (project?.workspacePath ?? '').trim()
  const rootEntries = rootPath ? entriesByPath[rootPath] : undefined

  const renderFile = useCallback((file: FileEntryDto) => {
    return <FileItem key={file.fullPath}>{file.name}</FileItem>
  }, [])

  const renderDirectory = useCallback(
    (dir: DirectoryEntryDto) => {
      const children = entriesByPath[dir.fullPath]
      const nodeLoading = Boolean(nodeLoadingByPath[dir.fullPath])
      const nodeError = nodeErrorByPath[dir.fullPath]

      return (
        <FolderItem key={dir.fullPath} value={dir.fullPath}>
          <FolderTrigger
            onClick={(e) => {
              e.stopPropagation()
              void ensureEntries(dir.fullPath)
            }}
          >
            {dir.name}
          </FolderTrigger>

          <FolderContent>
            {nodeError ? (
              <div className="px-2 py-2 text-sm text-destructive">{nodeError}</div>
            ) : null}

            {nodeLoading ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">加载中…</div>
            ) : null}

            {!nodeLoading && children ? (
              <div className="space-y-1">
                {children.directories.length || children.files.length ? null : (
                  <div className="px-2 py-2 text-sm text-muted-foreground">暂无内容</div>
                )}

                {children.directories.length ? (
                  <SubFiles>{children.directories.map(renderDirectory)}</SubFiles>
                ) : null}

                {children.files.length ? (
                  <div className="px-2">{children.files.map(renderFile)}</div>
                ) : null}
              </div>
            ) : null}
          </FolderContent>
        </FolderItem>
      )
    },
    [ensureEntries, entriesByPath, nodeErrorByPath, nodeLoadingByPath, renderFile],
  )

  const rootFilesView = useMemo(() => {
    if (!project) return null

    if (!rootPath) {
      return <div className="px-4 py-6 text-sm text-muted-foreground">未设置工作空间</div>
    }

    const nodeLoading = Boolean(nodeLoadingByPath[rootPath])
    const nodeError = nodeErrorByPath[rootPath]
    if (nodeError) {
      return <div className="px-4 py-6 text-sm text-destructive">{nodeError}</div>
    }

    if (nodeLoading || !rootEntries) {
      return <div className="px-4 py-6 text-sm text-muted-foreground">加载中…</div>
    }

    if (!rootEntries.directories.length && !rootEntries.files.length) {
      return <div className="px-4 py-6 text-sm text-muted-foreground">暂无文件</div>
    }

    return (
      <Files className="h-full">
        {rootEntries.directories.map(renderDirectory)}
        {rootEntries.files.map(renderFile)}
      </Files>
    )
  }, [
    project,
    renderDirectory,
    renderFile,
    rootEntries,
    rootPath,
    nodeErrorByPath,
    nodeLoadingByPath,
  ])

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">
            {project?.name ?? (loading ? '加载中…' : '项目')}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {project?.workspacePath ?? (loading ? '正在获取项目详情…' : '')}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={() => window.history.back()}>
            返回
          </Button>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            刷新
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden flex gap-4">
        <aside className="w-1/4 min-w-[260px] shrink-0 overflow-hidden rounded-lg border bg-card flex flex-col">
          <div className="border-b px-4 py-3 text-sm font-medium">文件</div>
          <div className="min-h-0 flex-1 overflow-hidden">{rootFilesView}</div>
        </aside>

        <section className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-card flex flex-col">
          <div className="border-b px-4 py-3 text-sm font-medium">对话</div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {project ? (
              <ProjectChatPanel key={project.id} project={project} />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                {loading ? '加载中…' : '未找到项目。'}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
