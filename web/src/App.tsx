import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ProvidersPage } from '@/pages/ProvidersPage'
import { ProjectWorkspacePage } from '@/pages/ProjectWorkspacePage'
import { ToolPage } from '@/pages/ToolPage'
import { ThemeTogglerButton } from '@animate-ui/components-buttons-theme-toggler'

function NavLink({
  to,
  label,
}: {
  to: string
  label: string
}) {
  const location = useLocation()
  const active = location.pathname === to

  return (
    <Link
      to={to}
      className={cn(
        'w-full rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {label}
    </Link>
  )
}

export default function App() {
  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex h-full w-full max-w-none gap-6 px-4 py-6">
        <aside className="w-56 shrink-0">
          <div className="rounded-lg border bg-card p-3">
            <div className="mb-3 flex items-center justify-between px-2">
              <div className="text-sm font-semibold">OneCode</div>
              <ThemeTogglerButton
                aria-label="切换主题"
                title="切换主题"
                variant="ghost"
                size="sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <NavLink to="/codex" label="Codex" />
              <NavLink to="/claude" label="Claude Code" />
              <NavLink to="/providers" label="提供商管理" />
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            本机工具，无需登录
          </div>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/codex" replace />} />
            <Route path="/codex" element={<ToolPage tool="codex" title="Codex" />} />
            <Route path="/claude" element={<ToolPage tool="claude" title="Claude Code" />} />
            <Route path="/providers" element={<ProvidersPage />} />
            <Route path="/projects/:id" element={<ProjectWorkspacePage />} />
            <Route path="*" element={<Navigate to="/codex" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
