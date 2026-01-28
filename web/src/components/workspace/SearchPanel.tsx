import { cn } from '@/lib/utils'
import { Search } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspaceStore'

/**
 * SearchPanel 组件属性
 */
export interface SearchPanelProps {
  /** 自定义类名 */
  className?: string
}

/**
 * SearchPanel - 搜索面板组件
 *
 * 提供项目内容搜索功能，支持：
 * - 文本搜索
 * - 正则表达式
 * - 大小写敏感切换
 * - 搜索结果显示
 *
 * TODO: 在后续任务中实现完整功能
 */
export function SearchPanel({ className }: SearchPanelProps) {
  const searchQuery = useWorkspaceStore((state) => state.searchQuery)
  const setSearchQuery = useWorkspaceStore((state) => state.setSearchQuery)
  const searchResults = useWorkspaceStore((state) => state.searchResults)

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* 搜索输入框 */}
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索"
            className={cn(
              'w-full pl-8 pr-3 py-1.5 text-sm',
              'bg-muted/50 border border-border rounded',
              'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary',
              'placeholder:text-muted-foreground/60'
            )}
          />
        </div>
      </div>

      {/* 搜索结果 */}
      <div className="flex-1 overflow-auto">
        {searchQuery ? (
          searchResults.length > 0 ? (
            <div className="px-2 py-1 text-xs text-muted-foreground">
              {/* 占位：搜索结果将在后续任务中实现 */}
              找到 {searchResults.length} 个结果
            </div>
          ) : (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              未找到结果
            </div>
          )
        ) : (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            输入搜索内容
          </div>
        )}
      </div>
    </div>
  )
}
