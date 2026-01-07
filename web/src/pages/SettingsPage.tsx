import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Info } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type SettingsMenuItem = {
  id: string
  label: string
  path: string
  icon: LucideIcon
}

const settingsMenuItems: SettingsMenuItem[] = [
  {
    id: 'about',
    label: '关于',
    path: '/settings/about',
    icon: Info,
  },
]

function SettingsMenuItem({
  item,
}: {
  item: SettingsMenuItem
}) {
  const location = useLocation()
  // 使用前缀匹配：检查当前路径是否以菜单项路径开头
  const isActive = location.pathname.startsWith(item.path) ||
    (item.id === 'about' && location.pathname === '/settings')
  const Icon = item.icon

  return (
    <NavLink
      to={item.path}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  )
}

export function SettingsPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="mb-6 flex-shrink-0">
        <h1 className="text-2xl font-semibold">设置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理应用程序设置和查看项目信息
        </p>
      </div>

      <div className="flex min-h-0 gap-6">
        {/* Left Menu - Fixed */}
        <aside className="w-56 shrink-0">
          <nav className="space-y-1">
            {settingsMenuItems.map((item) => (
              <SettingsMenuItem key={item.id} item={item} />
            ))}
          </nav>
        </aside>

        {/* Right Content Area - Scrollable */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="rounded-lg border bg-card p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
