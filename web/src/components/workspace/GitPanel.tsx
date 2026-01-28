import { cn } from '@/lib/utils'
import { GitBranch } from 'lucide-react'

/**
 * GitPanel 组件属性
 */
export interface GitPanelProps {
  /** 自定义类名 */
  className?: string
}

/**
 * GitPanel - Git 面板组件
 *
 * 显示 Git 状态和操作，支持：
 * - 文件变更状态
 * - 暂存/取消暂存
 * - 提交历史
 *
 * TODO: 这是可选功能，在后续任务中实现
 */
export function GitPanel({ className }: GitPanelProps) {
  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <GitBranch className="w-8 h-8 mb-2 opacity-50" />
        <div className="text-sm">源代码管理</div>
        <div className="text-xs text-muted-foreground/60 mt-1">
          即将推出
        </div>
      </div>
    </div>
  )
}
