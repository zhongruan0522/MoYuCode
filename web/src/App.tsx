import { useEffect, useState, type ReactNode } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'
import { cn } from '@/lib/utils'
import { CodePage } from '@/pages/CodePage'
import { NodeInstallPage } from '@/pages/NodeInstallPage'
import { ToolPage } from '@/pages/ToolPage'
import Providers from '@/pages/Providers'
import { SettingsPage } from '@/pages/SettingsPage'
import { AboutSection } from '@/pages/settings/AboutSection'
import { api } from '@/api/client'
import { ThemeTogglerButton } from '@animate-ui/components-buttons-theme-toggler'
import { Database, Settings } from 'lucide-react'
import { LogoBubble } from '@/components/LogoBubble'

function MaskIcon({ src, className }: { src: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-5 bg-current', className)}
      style={{
        maskImage: `url(${src})`,
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskImage: `url(${src})`,
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        WebkitMaskSize: 'contain',
      }}
    />
  )
}

function NavIconLink({
  to,
  label,
  icon,
}: {
  to: string
  label: string
  icon: ReactNode
}) {
  const location = useLocation()
  const active = location.pathname === to

  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-10 items-center justify-center rounded-lg transition-colors',
        active
          ? 'bg-accent text-accent-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Link>
  )
}

function parseVersion(version: string): number[] | null {
  const cleaned = version.trim().replace(/^v/i, '')
  const base = cleaned.split('-')[0]
  if (!base) return null
  const parts = base.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.some((part) => Number.isNaN(part))) return null
  return parts
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  if (!leftParts || !rightParts) return 0
  const maxLength = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0
    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }
  return 0
}

function LegacyProjectRouteRedirect() {
  const { id } = useParams()
  if (!id) return <Navigate to="/code" replace />
  return <Navigate to={`/code?projects=${encodeURIComponent(id)}`} replace />
}

export default function App() {
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.app
      .version()
      .then((res) => {
        if (!cancelled) setAppVersion(res.version)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('https://api.github.com/repos/AIDotNet/OneCode/releases/latest', {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
      },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data) => {
        const version = typeof data?.tag_name === 'string' ? data.tag_name : null
        setLatestVersion(version)
      })
      .catch(() => {})
    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!appVersion || !latestVersion) {
      setUpdateAvailable(false)
      return
    }
    setUpdateAvailable(compareVersions(latestVersion, appVersion) > 0)
  }, [appVersion, latestVersion])

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full w-full">
        <aside className="flex w-16 shrink-0 flex-col items-center border-r bg-card px-2 py-4">
          <LogoBubble />
          <nav className="flex flex-col items-center gap-2">
            <NavIconLink
              to="/code"
              label="Code"
              icon={<MaskIcon src="/icon/code.svg" />}
            />
            <NavIconLink
              to="/claude"
              label="Claude Code"
              icon={<MaskIcon src="/icon/claude-code.svg" />}
            />
            <NavIconLink
              to="/providers"
              label="提供商管理"
              icon={<Database className="size-5" aria-hidden="true" />}
            />
          </nav>

          <div className="mt-auto flex flex-col items-center gap-2">
            <ThemeTogglerButton
              aria-label="切换主题"
              title="切换主题"
              variant="ghost"
              size="lg"
            />
            <NavIconLink
              to="/settings"
              label="设置"
              icon={<Settings className="size-5" aria-hidden="true" />}
            />
            {appVersion ? (
              <div className="mt-1 w-full text-center text-[10px] leading-none text-muted-foreground">
                <span className="relative inline-flex items-center">
                  v{appVersion}
                  {updateAvailable ? (
                    <span className="ml-1 inline-flex size-1.5 rounded-full bg-red-500" />
                  ) : null}
                </span>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Navigate to="/code" replace />} />
            <Route path="/code" element={<CodePage />} />
            <Route path="/node" element={<NodeInstallPage />} />
            <Route path="/codex" element={<ToolPage tool="codex" title="Codex" />} />
            <Route path="/claude" element={<CodePage />} />
            <Route
              path="/claude/tool"
              element={
                <ToolPage
                  tool="claude"
                  title="Claude Code"
                  fallbackRoute="/claude"
                />
              }
            />
            <Route path="/providers" element={<Providers />} />
            <Route path="/settings" element={<SettingsPage />}>
              <Route index element={<AboutSection />} />
              <Route path="about" element={<AboutSection />} />
            </Route>
            <Route path="/projects/:id" element={<LegacyProjectRouteRedirect />} />
            <Route path="*" element={<Navigate to="/code" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
