import { cn } from '@/lib/utils'
import { Search, FileCode, Command } from 'lucide-react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'

/**
 * 快速打开项类型
 */
export interface QuickOpenItem {
  /** 项目类型 */
  type: 'file' | 'command'
  /** 显示标签 */
  label: string
  /** 描述信息 */
  description?: string
  /** 文件路径（仅 file 类型） */
  path?: string
}

/**
 * QuickOpen 组件属性
 */
export interface QuickOpenProps {
  /** 自定义类名 */
  className?: string
}

/**
 * QuickOpenContent - 快速打开弹窗内容组件
 * 
 * 将内容分离出来，这样每次打开时都会重新挂载，自动重置状态
 */
function QuickOpenContent({ 
  className, 
  onClose,
  onOpenFile,
}: { 
  className?: string
  onClose: () => void
  onOpenFile: (path: string, title?: string) => void
}) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // 模拟的文件列表（TODO: 从后端获取）
  const [items] = useState<QuickOpenItem[]>([
    { type: 'file', label: 'App.tsx', description: 'src/', path: 'src/App.tsx' },
    { type: 'file', label: 'index.ts', description: 'src/', path: 'src/index.ts' },
  ])

  // 过滤结果
  const filteredItems = query
    ? items.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      )
    : items

  // 聚焦输入框
  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }, [])

  /**
   * 处理选择项目
   */
  const handleSelect = useCallback((item: QuickOpenItem) => {
    if (item.type === 'file' && item.path) {
      onOpenFile(item.path, item.label)
    }
    onClose()
  }, [onOpenFile, onClose])

  /**
   * 处理键盘事件
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredItems[selectedIndex]) {
          handleSelect(filteredItems[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [filteredItems, selectedIndex, handleSelect, onClose])

  /**
   * 获取项目图标
   */
  const getItemIcon = (item: QuickOpenItem) => {
    switch (item.type) {
      case 'file':
        return <FileCode className="w-4 h-4" />
      case 'command':
        return <Command className="w-4 h-4" />
      default:
        return <FileCode className="w-4 h-4" />
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50" />

      {/* 弹窗内容 */}
      <div
        className={cn(
          'relative w-full max-w-xl bg-background border border-border rounded-lg shadow-2xl overflow-hidden',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索输入框 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="搜索文件..."
            className={cn(
              'flex-1 bg-transparent text-sm',
              'focus:outline-none',
              'placeholder:text-muted-foreground/60'
            )}
          />
        </div>

        {/* 结果列表 */}
        <div className="max-h-[300px] overflow-auto">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, index) => (
              <div
                key={`${item.type}-${item.path || item.label}`}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 cursor-pointer',
                  'transition-colors duration-100',
                  index === selectedIndex
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50'
                )}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="text-muted-foreground">
                  {getItemIcon(item)}
                </span>
                <span className="text-sm">{item.label}</span>
                {item.description && (
                  <span className="text-xs text-muted-foreground/60">
                    {item.description}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              {query ? '未找到匹配的文件' : '暂无最近文件'}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground/60 bg-muted/30 border-t border-border">
          <span>
            <kbd className="px-1 py-0.5 bg-muted rounded">↑↓</kbd> 导航
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-muted rounded">Enter</kbd> 打开
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-muted rounded">Esc</kbd> 关闭
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * QuickOpen - 快速打开弹窗组件
 *
 * 提供文件快速搜索和命令面板功能，支持：
 * - 模糊匹配文件名
 * - 最近文件优先显示
 * - 键盘导航
 *
 * TODO: 在后续任务中实现完整功能
 */
export function QuickOpen({ className }: QuickOpenProps) {
  const quickOpenVisible = useWorkspaceStore((state) => state.quickOpenVisible)
  const closeQuickOpen = useWorkspaceStore((state) => state.closeQuickOpen)
  const openFile = useWorkspaceStore((state) => state.openFile)

  if (!quickOpenVisible) {
    return null
  }

  // 使用 key 来确保每次打开时重新挂载组件，自动重置状态
  return (
    <QuickOpenContent
      key="quick-open-content"
      className={className}
      onClose={closeQuickOpen}
      onOpenFile={openFile}
    />
  )
}
