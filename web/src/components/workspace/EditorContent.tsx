import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { FolderOpen, Loader2 } from 'lucide-react'
import type { EditorTab } from '@/stores/workspaceStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { MonacoCode, type MonacoCodeSelection } from '@/components/MonacoCode'
import { DiffViewer } from '@/components/DiffViewer'
import { api } from '@/api/client'

/**
 * EditorContent 组件属性
 */
export interface EditorContentProps {
  /** 当前激活的标签页 */
  activeTab: EditorTab | null | undefined
  /** 自定义类名 */
  className?: string
  /** 代码选择变化回调 */
  onSelectionChange?: (selection: MonacoCodeSelection | null, filePath?: string) => void
}

/**
 * EditorContent - 编辑器内容组件
 *
 * 根据当前标签页类型显示不同的内容：
 * - file: Monaco 编辑器
 * - diff: Diff 查看器
 * - preview: 预览视图
 * - welcome: 欢迎视图
 */
export function EditorContent({ activeTab, className, onSelectionChange }: EditorContentProps) {
  // 没有打开的标签页时显示欢迎视图
  if (!activeTab) {
    return <WelcomeView className={className} />
  }

  // 根据标签页类型渲染内容
  switch (activeTab.kind) {
    case 'file':
      return (
        <FileEditorView
          tab={activeTab}
          className={className}
          onSelectionChange={onSelectionChange}
        />
      )

    case 'diff':
      return <DiffEditorView tab={activeTab} className={className} />

    case 'preview':
      return (
        <div className={cn('flex flex-col h-full', className)}>
          <div className="flex-1 flex items-center justify-center bg-muted/10">
            <div className="text-center text-muted-foreground">
              <div className="text-sm">预览</div>
              <div className="text-xs text-muted-foreground/60 mt-1">
                {activeTab.title}
              </div>
            </div>
          </div>
        </div>
      )

    case 'welcome':
    default:
      return <WelcomeView className={className} />
  }
}

/**
 * WelcomeView - 欢迎视图组件
 */
function WelcomeView({ className }: { className?: string }) {
  const openQuickOpen = useWorkspaceStore((state) => state.openQuickOpen)

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full bg-muted/5',
        className
      )}
    >
      <FolderOpen className="w-16 h-16 text-muted-foreground/30 mb-4" />
      <h2 className="text-lg font-medium text-muted-foreground mb-2">
        欢迎使用 MoYuCode
      </h2>
      <p className="text-sm text-muted-foreground/60 text-center max-w-md">
        从左侧文件资源管理器中选择文件开始编辑，
        <br />
        或使用{' '}
        <button
          onClick={openQuickOpen}
          className="px-1.5 py-0.5 bg-muted rounded text-xs hover:bg-muted/80 transition-colors"
        >
          Ctrl+P
        </button>{' '}
        快速打开文件
      </p>
    </div>
  )
}

/**
 * FileEditorView - 文件编辑器视图
 */
function FileEditorView({
  tab,
  className,
  onSelectionChange,
}: {
  tab: EditorTab
  className?: string
  onSelectionChange?: (selection: MonacoCodeSelection | null, filePath?: string) => void
}) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const setTabDirty = useWorkspaceStore((state) => state.setTabDirty)

  // 加载文件内容
  useEffect(() => {
    if (!tab.path) {
      setContent('')
      setLoading(false)
      return
    }

    let canceled = false
    setLoading(true)
    setError(null)

    api.fs
      .readFile(tab.path)
      .then((data) => {
        if (!canceled) {
          setContent(data.content)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!canceled) {
          setError((e as Error).message)
          setLoading(false)
        }
      })

    return () => {
      canceled = true
    }
  }, [tab.path])

  // 处理内容变化
  const handleChange = useCallback(
    (value: string) => {
      setContent(value)
      setTabDirty(tab.id, true)
    },
    [tab.id, setTabDirty]
  )

  // 处理选择变化
  const handleSelectionChange = useCallback(
    (selection: MonacoCodeSelection | null) => {
      onSelectionChange?.(selection, tab.path)
    },
    [onSelectionChange, tab.path]
  )

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center text-destructive">
          <div className="text-sm">加载失败</div>
          <div className="text-xs mt-1">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('h-full', className)}>
      <MonacoCode
        code={content ?? ''}
        filePath={tab.path}
        readOnly={false}
        onChange={handleChange}
        onSelectionChange={handleSelectionChange}
      />
    </div>
  )
}

/**
 * DiffEditorView - Diff 编辑器视图
 */
function DiffEditorView({
  tab,
  className,
}: {
  tab: EditorTab
  className?: string
}) {
  // TODO: 从 tab 的额外数据中获取 diff 内容
  // 目前显示占位内容
  const diffContent = ''

  return (
    <div className={cn('h-full', className)}>
      {diffContent ? (
        <DiffViewer diff={diffContent} viewMode="split" />
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <div className="text-sm">Diff 查看器</div>
            <div className="text-xs text-muted-foreground/60 mt-1">
              {tab.title}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
