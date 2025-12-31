import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { JobDto, ToolKey, ToolStatusDto, ToolType } from '@/api/types'
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from '@/components/animate-ui/components/radix/tabs'
import { Button } from '@/components/ui/button'
import { ProjectsTab } from '@/pages/tabs/ProjectsTab'

type TabKey = 'overview' | 'projects'

export function ToolPage({ tool, title }: { tool: ToolKey; title: string }) {
  const toolType: ToolType = tool === 'codex' ? 'Codex' : 'ClaudeCode'
  const [searchParams, setSearchParams] = useSearchParams()

  const [status, setStatus] = useState<ToolStatusDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installJob, setInstallJob] = useState<JobDto | null>(null)

  const tabParam = searchParams.get('tab')

  const allowedTabs = useMemo(() => {
    const base = [{ key: 'overview', label: '首页' }] as const
    if (!status?.installed) return base
    return [
      ...base,
      { key: 'projects', label: '项目管理' },
    ] as const
  }, [status?.installed])

  const tab: TabKey = useMemo(() => {
    const isAllowed = allowedTabs.some((t) => t.key === tabParam)
    return isAllowed ? (tabParam as TabKey) : 'overview'
  }, [allowedTabs, tabParam])

  const setTab = useCallback(
    (next: TabKey) => {
      const sp = new URLSearchParams(searchParams)
      sp.set('tab', next)
      setSearchParams(sp, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.tools.status(tool)
      setStatus(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [tool])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!status?.installed && tab === 'projects') {
      setTab('overview')
    }
  }, [setTab, status?.installed, tab])

  useEffect(() => {
    if (!installJob) return
    if (installJob.status === 'Succeeded' || installJob.status === 'Failed') return

    const timer = window.setInterval(async () => {
      try {
        const latest = await api.jobs.get(installJob.id)
        setInstallJob(latest)
        if (latest.status === 'Succeeded' || latest.status === 'Failed') {
          await load()
        }
      } catch (e) {
        setError((e as Error).message)
      }
    }, 1200)

    return () => window.clearInterval(timer)
  }, [installJob, load])

  const install = async () => {
    setLoading(true)
    setError(null)
    try {
      const job = await api.tools.install(tool)
      setInstallJob(job)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">{title}</div>
          <div className="text-sm text-muted-foreground">
            版本检测、安装、项目启动
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            刷新
          </Button>
          {status && !status.installed ? (
            <Button type="button" onClick={() => void install()} disabled={loading}>
              安装（npm）
            </Button>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      )}

      <Tabs value={tab} onValueChange={(k) => setTab(k as TabKey)}>
        <TabsList>
          {allowedTabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContents>
          <TabsContent value="overview">
            <div className="rounded-lg border bg-card p-4">
              {status ? (
                <div className="space-y-2 text-sm">
                  <div>
                    安装状态：
                    {status.installed ? (
                      <span className="ml-2 text-foreground">已安装</span>
                    ) : (
                      <span className="ml-2 text-destructive">未安装</span>
                    )}
                  </div>
                  <div>版本：{status.version ?? '—'}</div>
                  <div className="break-all">
                    可执行文件：{status.executablePath ?? '—'}
                  </div>
                  <div className="break-all">
                    配置文件：{status.configPath} {status.configExists ? '' : '（不存在）'}
                  </div>

                  {!status.installed ? (
                    <div className="pt-2 text-muted-foreground">
                      未安装时仅显示首页；安装完成后会解锁“项目管理”。
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {loading ? '加载中…' : '点击刷新获取状态'}
                </div>
              )}
            </div>
          </TabsContent>

          {status?.installed ? (
            <TabsContent value="projects">
              <ProjectsTab toolType={toolType} />
            </TabsContent>
          ) : null}
        </TabsContents>
      </Tabs>

      {installJob ? (
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-medium">
            安装日志：{installJob.kind}（{installJob.status}）
          </div>
          <pre className="max-h-[360px] overflow-auto p-4 text-xs">
            {installJob.logs.join('\n')}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
