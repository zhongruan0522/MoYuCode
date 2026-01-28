import { cn } from '@/lib/utils'
import {
  Files,
  Search,
  GitBranch,
  Terminal,
  type LucideIcon,
} from 'lucide-react'
import { useWorkspaceStore, type ActiveView } from '@/stores/workspaceStore'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * 活动栏项目配置
 */
interface ActivityItem {
  id: ActiveView
  icon: LucideIcon
  label: string
  shortcut: string
}

/**
 * 活动栏项目列表
 */
const activityItems: ActivityItem[] = [
  { id: 'explorer', icon: Files, label: '资源管理器', shortcut: 'Ctrl+Shift+E' },
  { id: 'search', icon: Search, label: '搜索', shortcut: 'Ctrl+Shift+F' },
  { id: 'git', icon: GitBranch, label: 'Git', shortcut: 'Ctrl+Shift+G' },
  { id: 'terminal', icon: Terminal, label: '终端', shortcut: 'Ctrl+`' },
]

/**
 * ActivityBar 组件属性
 */
export interface ActivityBarProps {
  /** 自定义类名 */
  className?: string
}

/**
 * ActivityBar - 活动栏组件
 *
 * 位于工作区最左侧，提供视图切换功能。
 * 包含文件资源管理器、搜索、Git、终端等视图切换按钮。
 *
 * 功能特性：
 * - 视图切换：点击图标切换不同视图
 * - 激活指示器：左侧 2px 宽的主题色条显示当前激活视图
 * - Tooltip 提示：悬停显示名称和快捷键
 * - 键盘导航：支持 Tab 键导航和 ARIA 属性
 *
 * 样式规范：
 * - 宽度：48px (w-12)
 * - 图标大小：24px (w-6 h-6)
 * - 背景色：bg-muted/30
 * - 激活指示器：左侧 2px 宽的主题色条
 */
export function ActivityBar({ className }: ActivityBarProps) {
  const activeView = useWorkspaceStore((state) => state.activeView)
  const setActiveView = useWorkspaceStore((state) => state.setActiveView)

  /**
   * 处理键盘事件
   * 支持 Enter 和 Space 键激活按钮
   */
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    viewId: ActiveView
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setActiveView(viewId)
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <nav
        className={cn(
          'flex flex-col items-center w-12 bg-muted/30 border-r border-border',
          className
        )}
        role="tablist"
        aria-label="活动栏"
        aria-orientation="vertical"
      >
        {activityItems.map((item, index) => {
          const Icon = item.icon
          const isActive = activeView === item.id

          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'relative w-full h-12 flex items-center justify-center',
                    'text-muted-foreground hover:text-foreground',
                    'transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    isActive && 'text-foreground'
                  )}
                  onClick={() => setActiveView(item.id)}
                  onKeyDown={(e) => handleKeyDown(e, item.id)}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`${item.id}-panel`}
                  tabIndex={isActive ? 0 : -1}
                  id={`${item.id}-tab`}
                >
                  {/* 激活状态指示器 - 左侧 2px 宽的主题色条 */}
                  {isActive && (
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 bg-primary rounded-r"
                      aria-hidden="true"
                    />
                  )}
                  <Icon className="w-6 h-6" aria-hidden="true" />
                  <span className="sr-only">{item.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <p className="font-medium">{item.label}</p>
                <p className="text-primary-foreground/70 text-[10px]">
                  {item.shortcut}
                </p>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </nav>
    </TooltipProvider>
  )
}
