import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, formatUtc } from '@/api/client'
import type {
  ProjectDto,
  ProjectUpsertRequest,
  ProviderDto,
  ToolType,
} from '@/api/types'
import { cn } from '@/lib/utils'
import { DirectoryPicker } from '@/components/DirectoryPicker'
import { Modal } from '@/components/Modal'
import { MoreHorizontal } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProjectSessionsView } from '@/pages/tabs/ProjectSessionsView'

type FormState = {
  name: string
  workspacePath: string
  providerId: string | null
  model: string
}

function emptyForm(): FormState {
  return { name: '', workspacePath: '', providerId: null, model: '' }
}

export function ProjectsTab({ toolType }: { toolType: ToolType }) {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [providers, setProviders] = useState<ProviderDto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openActionsId, setOpenActionsId] = useState<string | null>(null)
  const [mountedActionsId, setMountedActionsId] = useState<string | null>(null)
  const [sessionsProject, setSessionsProject] = useState<ProjectDto | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectDto | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProjectDto | null>(null)

  const [scanOpen, setScanOpen] = useState(false)
  const [scanRunning, setScanRunning] = useState(false)
  const [scanLogs, setScanLogs] = useState<string[]>([])
  const scanEventSourceRef = useRef<EventSource | null>(null)
  const scanLogEndRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, prov] = await Promise.all([
        api.projects.list(toolType),
        api.providers.list(),
      ])
      setProjects(p)
      setProviders(prov)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [toolType])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (openActionsId) {
      setMountedActionsId(openActionsId)
      return
    }

    if (!mountedActionsId) return
    const t = window.setTimeout(() => setMountedActionsId(null), 150)
    return () => window.clearTimeout(t)
  }, [mountedActionsId, openActionsId])

  useEffect(() => {
    if (!openActionsId) return

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!target) return

      const root = target.closest('[data-actions-id]')
      if (root && root.getAttribute('data-actions-id') === openActionsId) return

      setOpenActionsId(null)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenActionsId(null)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openActionsId])

  const openProject = useCallback(
    (id: string) => {
      navigate(`/projects/${id}`)
    },
    [navigate],
  )

  const appendScanLog = useCallback((line: string) => {
    setScanLogs((prev) => {
      const next = [...prev, line]
      if (next.length > 500) next.splice(0, next.length - 500)
      return next
    })
  }, [])

  useEffect(() => {
    return () => {
      scanEventSourceRef.current?.close()
      scanEventSourceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!scanOpen) return
    scanLogEndRef.current?.scrollIntoView({ block: 'end' })
  }, [scanLogs, scanOpen])

  const filteredProviders = useMemo(() => {
    if (toolType === 'Codex') {
      return providers.filter((p) => p.requestType !== 'Anthropic')
    }
    return providers.filter((p) => p.requestType === 'Anthropic')
  }, [providers, toolType])

  const selectedProvider = useMemo(() => {
    if (!form.providerId) return null
    return providers.find((p) => p.id === form.providerId) ?? null
  }, [form.providerId, providers])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const closeScanModal = useCallback(() => {
    scanEventSourceRef.current?.close()
    scanEventSourceRef.current = null
    setScanRunning(false)
    setScanOpen(false)
  }, [])

  const stopScan = useCallback(() => {
    if (!scanRunning) return
    scanEventSourceRef.current?.close()
    scanEventSourceRef.current = null
    setScanRunning(false)
    appendScanLog('已停止扫描。')
  }, [appendScanLog, scanRunning])

  const startScan = useCallback(() => {
    if (scanRunning) return
    setScanLogs([])
    setScanOpen(true)
    setScanRunning(true)

    scanEventSourceRef.current?.close()
    const eventSource = api.projects.scanCodexSessions(toolType)
    scanEventSourceRef.current = eventSource

    eventSource.addEventListener('log', (e) => {
      appendScanLog((e as MessageEvent).data as string)
    })

    eventSource.addEventListener('done', (e) => {
      const raw = (e as MessageEvent).data as string
      try {
        const summary = JSON.parse(raw) as {
          scannedFiles: number
          uniqueCwds: number
          created: number
          skippedExisting: number
          skippedMissingWorkspace: number
          readErrors: number
          jsonErrors: number
        }
        appendScanLog(
          `完成：扫描文件 ${summary.scannedFiles}，cwd ${summary.uniqueCwds}，创建 ${summary.created}，跳过已存在 ${summary.skippedExisting}，跳过不存在目录 ${summary.skippedMissingWorkspace}。`,
        )
        if (summary.readErrors || summary.jsonErrors) {
          appendScanLog(
            `提示：读取错误 ${summary.readErrors}，JSON 解析错误 ${summary.jsonErrors}（详情见上方日志）。`,
          )
        }
      } catch {
        appendScanLog(`完成：${raw}`)
      }

      eventSource.close()
      scanEventSourceRef.current = null
      setScanRunning(false)
      void load()
    })

    eventSource.onerror = () => {
      appendScanLog('连接已中断（可能已完成或服务器异常）。')
      eventSource.close()
      scanEventSourceRef.current = null
      setScanRunning(false)
    }
  }, [appendScanLog, load, scanRunning, toolType])

  const openEdit = (p: ProjectDto) => {
    setEditing(p)
    setForm({
      name: p.name,
      workspacePath: p.workspacePath,
      providerId: p.providerId,
      model: p.model ?? '',
    })
    setModalOpen(true)
  }

  const canSubmit = useMemo(() => {
    if (!form.name.trim()) return false
    if (!form.workspacePath.trim()) return false
    return true
  }, [form.name, form.workspacePath])

  const submit = async () => {
    setLoading(true)
    setError(null)
    const payload: ProjectUpsertRequest = {
      toolType,
      name: form.name.trim(),
      workspacePath: form.workspacePath.trim(),
      providerId: form.providerId,
      model: form.model.trim() ? form.model.trim() : null,
    }

    try {
      if (editing) {
        await api.projects.update(editing.id, payload)
      } else {
        await api.projects.create(payload)
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const openRemove = (p: ProjectDto) => {
    setDeleteTarget(p)
    setDeleteDialogOpen(true)
  }

  const remove = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      await api.projects.delete(id)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const confirmRemove = async () => {
    if (!deleteTarget) return
    const id = deleteTarget.id
    setDeleteDialogOpen(false)
    setDeleteTarget(null)
    await remove(id)
  }

  const start = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      await api.projects.start(id)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const modelDatalistId = useMemo(() => {
    return `models-${toolType}`
  }, [toolType])

  if (sessionsProject) {
    return (
      <ProjectSessionsView
        project={sessionsProject}
        onBack={() => setSessionsProject(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium">项目管理</div>
          <div className="text-xs text-muted-foreground">
            项目可绑定提供商；未绑定则使用系统默认配置。支持配置模型并一键启动。
          </div>
        </div>
        <div className="flex items-center gap-2">
          {toolType === 'Codex' ? (
            <Button
              type="button"
              variant="outline"
              onClick={startScan}
              disabled={scanRunning}
            >
              自动扫描项目
            </Button>
          ) : null}
          <Button type="button" onClick={openCreate}>
            添加项目
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3 text-sm font-medium">
          项目列表 {loading ? '（处理中…）' : ''}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] table-fixed text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="sticky left-0 z-20 w-[16rem] border-r bg-card px-4 py-2 text-left">
                  名称
                </th>
                <th className="px-4 py-2 text-left">工作空间</th>
                <th className="w-[9rem] px-4 py-2 text-left whitespace-nowrap">
                  提供商
                </th>
                <th className="w-[11rem] px-4 py-2 text-left whitespace-nowrap">
                  模型
                </th>
                <th className="sticky right-0 z-20 w-[6rem] border-l bg-card px-4 py-2 text-right whitespace-nowrap">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.length ? (
                projects.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 border-r bg-card px-4 py-2">
                      <div className="truncate font-medium" title={p.name}>
                        {p.name}
                      </div>
                      {p.lastStartedAtUtc ? (
                        <div className="text-xs text-muted-foreground">
                          上次启动：{formatUtc(p.lastStartedAtUtc)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <div className="truncate" title={p.workspacePath}>
                        {p.workspacePath}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {p.providerName ? (
                        <div className="truncate" title={p.providerName}>
                          {p.providerName}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">默认配置</span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {p.model ? (
                        <div className="truncate" title={p.model}>
                          {p.model}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">（未指定）</span>
                      )}
                    </td>
                    <td className="sticky right-0 z-10 border-l bg-card px-4 py-2 text-right whitespace-nowrap">
                      <div
                        className="relative inline-flex justify-end"
                        data-actions-id={p.id}
                      >
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          aria-haspopup="menu"
                          aria-expanded={openActionsId === p.id}
                          aria-controls={
                            mountedActionsId === p.id
                              ? `project-actions-${p.id}`
                              : undefined
                          }
                          title="操作"
                          onClick={() => {
                            setOpenActionsId((current) => {
                              const next = current === p.id ? null : p.id
                              if (next) setMountedActionsId(next)
                              return next
                            })
                          }}
                        >
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">操作</span>
                        </Button>

                        {mountedActionsId === p.id ? (
                          <div
                            id={`project-actions-${p.id}`}
                            role="menu"
                            data-state={
                              openActionsId === p.id ? 'open' : 'closed'
                            }
                            className={cn(
                              'absolute right-0 top-full z-50 mt-1 w-36 origin-top-right rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
                              'data-[state=open]:animate-in data-[state=closed]:animate-out',
                              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
                              'duration-150',
                              openActionsId !== p.id && 'pointer-events-none',
                            )}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                              onClick={() => {
                                setOpenActionsId(null)
                                openProject(p.id)
                              }}
                            >
                              打开
                            </button>
                            {toolType === 'Codex' ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                                onClick={() => {
                                  setOpenActionsId(null)
                                  setSessionsProject(p)
                                }}
                              >
                                所有会话
                              </button>
                            ) : null}
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                              onClick={() => {
                                setOpenActionsId(null)
                                void start(p.id)
                              }}
                            >
                              启动
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                              onClick={() => {
                                setOpenActionsId(null)
                                openEdit(p)
                              }}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setOpenActionsId(null)
                                openRemove(p)
                              }}
                            >
                              删除
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                    还没有项目，先添加一个吧。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除项目</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除项目「{deleteTarget?.name ?? ''}」？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => void confirmRemove()}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Modal
        open={modalOpen}
        title={editing ? '编辑项目' : '添加项目'}
        onClose={() => setModalOpen(false)}
        className="max-w-3xl"
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">项目名</div>
            <Input
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="例如：OneCode"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">工作空间目录</div>
            <DirectoryPicker
              value={form.workspacePath}
              onChange={(path) => setForm((s) => ({ ...s, workspacePath: path }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                绑定提供商（可选）
              </div>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={form.providerId ?? ''}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    providerId: e.target.value ? e.target.value : null,
                  }))
                }
              >
                <option value="">默认配置</option>
                {filteredProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.requestType})
                  </option>
                ))}
              </select>
              {toolType === 'ClaudeCode' ? (
                <div className="text-xs text-muted-foreground">
                  Claude Code 仅支持 Anthropic 兼容提供商
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">模型（可选）</div>
              <Input
                list={selectedProvider?.models?.length ? modelDatalistId : undefined}
                value={form.model}
                onChange={(e) => setForm((s) => ({ ...s, model: e.target.value }))}
                placeholder={selectedProvider ? '可直接输入或从列表选择' : '例如：gpt-5.1-codex-max'}
              />
              {selectedProvider?.models?.length ? (
                <datalist id={modelDatalistId}>
                  {selectedProvider.models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              ) : null}
              {selectedProvider ? (
                <div className="text-xs text-muted-foreground">
                  当前提供商已缓存 {selectedProvider.models.length} 个模型（可在“提供商管理”中拉取更新）
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit || loading}
            >
              保存
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={scanOpen}
        title="自动扫描项目"
        onClose={closeScanModal}
        className="max-w-3xl"
      >
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            扫描 Codex sessions（~/.codex/sessions）下所有 jsonl 文件的首行，读取
            <code className="px-1">payload.cwd</code> 并自动创建项目。
          </div>
          <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap">
            <div className="max-h-[55vh] overflow-y-auto">
              {scanLogs.length ? scanLogs.join('\n') : '等待扫描日志…'}
              <div ref={scanLogEndRef} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {scanRunning ? (
              <Button type="button" variant="outline" onClick={stopScan}>
                停止扫描
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={closeScanModal}>
              关闭
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
