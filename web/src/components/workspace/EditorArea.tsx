import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { EditorTabs } from './EditorTabs'
import { EditorContent } from './EditorContent'

/**
 * EditorArea 组件属性
 */
export interface EditorAreaProps {
  /** 自定义类名 */
  className?: string
}

/**
 * EditorArea - 编辑器区域组件
 *
 * 包含编辑器标签栏和编辑器内容区域。
 * 支持多标签页、代码编辑、Diff 查看等功能。
 */
export function EditorArea({ className }: EditorAreaProps) {
  const openTabs = useWorkspaceStore((state) => state.openTabs)
  const activeTabId = useWorkspaceStore((state) => state.activeTabId)

  // 获取当前激活的标签页
  const activeTab = activeTabId
    ? openTabs.find((tab) => tab.id === activeTabId)
    : null

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* 编辑器标签栏 */}
      {openTabs.length > 0 && <EditorTabs />}

      {/* 编辑器内容 */}
      <div className="flex-1 overflow-hidden">
        <EditorContent activeTab={activeTab} />
      </div>
    </div>
  )
}
