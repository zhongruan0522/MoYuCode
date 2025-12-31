import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, formatUtc } from '@/api/client'
import type { ProviderDto, ProviderRequestType, ProviderUpsertRequest } from '@/api/types'
import { Modal } from '@/components/Modal'
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
import { Textarea } from '@/components/ui/textarea'

const requestTypeOptions: { value: ProviderRequestType; label: string }[] = [
  { value: 'AzureOpenAI', label: 'AzureOpenAI' },
  { value: 'OpenAI', label: 'OpenAI (Chat)' },
  { value: 'OpenAIResponses', label: 'OpenAI (Responses)' },
  { value: 'Anthropic', label: 'Anthropic' },
]

function emptyForm(): ProviderUpsertRequest {
  return {
    name: '',
    address: '',
    logo: null,
    apiKey: '',
    requestType: 'OpenAIResponses',
    azureApiVersion: null,
  }
}

export function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderDto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ProviderDto | null>(null)
  const [form, setForm] = useState<ProviderUpsertRequest>(emptyForm())

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProviderDto | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.providers.list()
      setProviders(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (p: ProviderDto) => {
    setEditing(p)
    setForm({
      name: p.name,
      address: p.address,
      logo: p.logo,
      apiKey: '',
      requestType: p.requestType,
      azureApiVersion: p.azureApiVersion,
    })
    setModalOpen(true)
  }

  const canSubmit = useMemo(() => {
    if (!form.name.trim()) return false
    if (!form.address.trim()) return false
    if (!editing && !form.apiKey.trim()) return false
    if (form.requestType === 'AzureOpenAI' && !form.azureApiVersion?.trim()) return false
    return true
  }, [editing, form])

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      if (editing) {
        await api.providers.update(editing.id, {
          ...form,
          azureApiVersion:
            form.requestType === 'AzureOpenAI' ? form.azureApiVersion : null,
        })
      } else {
        await api.providers.create({
          ...form,
          azureApiVersion:
            form.requestType === 'AzureOpenAI' ? form.azureApiVersion : null,
        })
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const refreshModels = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      await api.providers.refreshModels(id)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const openRemove = (p: ProviderDto) => {
    setDeleteTarget(p)
    setDeleteDialogOpen(true)
  }

  const remove = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      await api.providers.delete(id)
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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">提供商管理</div>
          <div className="text-sm text-muted-foreground">
            Address / ApiKey / 请求类型 / 模型列表
          </div>
        </div>
        <Button type="button" onClick={openCreate}>
          添加提供商
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3 text-sm font-medium">
          提供商列表 {loading ? '（加载中…）' : ''}
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 text-left">名称</th>
                <th className="px-4 py-2 text-left">类型</th>
                <th className="px-4 py-2 text-left">Address</th>
                <th className="px-4 py-2 text-left">ApiKey</th>
                <th className="px-4 py-2 text-left">模型</th>
                <th className="px-4 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {providers.length ? (
                providers.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium">{p.name}</div>
                      {p.logo ? (
                        <div className="text-xs text-muted-foreground">
                          Logo: {p.logo}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <div>{p.requestType}</div>
                      {p.requestType === 'AzureOpenAI' ? (
                        <div className="text-xs text-muted-foreground">
                          api-version: {p.azureApiVersion ?? ''}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <div className="max-w-[380px] truncate" title={p.address}>
                        {p.address}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {p.hasApiKey ? (
                        <span className="text-muted-foreground">
                          ****{p.apiKeyLast4 ?? ''}
                        </span>
                      ) : (
                        <span className="text-destructive">未设置</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-muted-foreground">
                        {p.models.length} 个
                      </div>
                      {p.modelsRefreshedAtUtc ? (
                        <div className="text-xs text-muted-foreground">
                          刷新于 {formatUtc(p.modelsRefreshedAtUtc)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void refreshModels(p.id)}
                        >
                          拉取模型
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(p)}
                        >
                          编辑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => openRemove(p)}
                        >
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                    还没有提供商，先添加一个吧。
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
            <AlertDialogTitle>确认删除提供商</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除提供商「{deleteTarget?.name ?? ''}」？
              关联项目会自动改为使用默认配置。
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
        title={editing ? '编辑提供商' : '添加提供商'}
        onClose={() => setModalOpen(false)}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">提供商名称</div>
              <Input
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="例如：Routin / OpenAI / Azure"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">请求类型</div>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={form.requestType}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    requestType: e.target.value as ProviderRequestType,
                  }))
                }
              >
                {requestTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Address</div>
            <Input
              value={form.address}
              onChange={(e) =>
                setForm((s) => ({ ...s, address: e.target.value }))
              }
              placeholder="例如：https://api.openai.com 或你的代理地址"
            />
          </div>

          {form.requestType === 'AzureOpenAI' ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                AzureOpenAI api-version
              </div>
              <Input
                value={form.azureApiVersion ?? ''}
                onChange={(e) =>
                  setForm((s) => ({ ...s, azureApiVersion: e.target.value }))
                }
                placeholder="例如：2025-04-01-preview"
              />
            </div>
          ) : null}

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">提供商 Logo（可选）</div>
            <Input
              value={form.logo ?? ''}
              onChange={(e) =>
                setForm((s) => ({ ...s, logo: e.target.value || null }))
              }
              placeholder="Logo URL"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">
              ApiKey {editing ? '（留空则保持不变）' : ''}
            </div>
            <Input
              type="password"
              value={form.apiKey}
              onChange={(e) =>
                setForm((s) => ({ ...s, apiKey: e.target.value }))
              }
              placeholder="输入 ApiKey"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">模型列表（只读）</div>
            <Textarea
              value={
                editing
                  ? editing.models.join('\n') || '（未拉取）'
                  : '（创建后可拉取）'
              }
              readOnly
              className="min-h-[120px]"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={!canSubmit || loading}>
              保存
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
