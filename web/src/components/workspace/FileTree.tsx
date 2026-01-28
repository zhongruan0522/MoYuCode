import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { api } from '@/api/client'
import type { DirectoryEntryDto, FileEntryDto, ListEntriesResponse } from '@/api/types'
import { getVscodeFileIconUrl, getVscodeFolderIconUrls } from '@/lib/vscodeFileIcons'
import {
  FileItem,
  Files,
  FolderContent,
  FolderItem,
  FolderTrigger,
  SubFiles,
} from '@animate-ui/components-base-files'
import { cn } from '@/lib/utils'

// ============================================================================
// 类型定义
// ============================================================================

export type FsEntryKind = 'file' | 'directory'

export interface FsEntryTarget {
  kind: FsEntryKind
  name: string
  fullPath: string
}

// ============================================================================
// 工具函数
// ============================================================================

export function normalizePathForComparison(path: string): string {
  return path.replace(/[\\/]+$/, '').toLowerCase()
}

export function getParentPath(fullPath: string): string | null {
  const normalized = fullPath.replace(/[\\/]+$/, '')
  const lastSeparator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (lastSeparator < 0) return null

  const parent = normalized.slice(0, lastSeparator)
  if (!parent) return null
  if (/^[a-zA-Z]:$/.test(parent)) return `${parent}\\`
  return parent
}

export function getBaseName(fullPath: string): string {
  const normalized = fullPath.replace(/[\\/]+$/, '')
  const lastSeparator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (lastSeparator < 0) return normalized
  const base = normalized.slice(lastSeparator + 1)
  return base || normalized
}

function buildVscodeIconImg(url: string | null | undefined): ReactNode | undefined {
  const normalized = (url ?? '').trim()
  if (!normalized) return undefined

  return (
    <img
      src={normalized}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="size-4.5 shrink-0"
    />
  )
}

// ============================================================================
// FileTree 组件属性
// ============================================================================

export interface FileTreeProps {
  /** 工作区根路径 */
  workspacePath: string
  /** 文件点击回调 */
  onFileClick?: (path: string) => void
  /** 右键菜单回调 */
  onContextMenu?: (e: ReactMouseEvent, target: FsEntryTarget) => void
  /** 自定义类名 */
  className?: string
  /** 文件搜索过滤关键词 */
  filterKeyword?: string
}

// ============================================================================
// FileTree 组件
// ============================================================================

/**
 * FileTree - 文件树组件
 *
 * 递归渲染文件树结构，支持：
 * - 懒加载文件夹内容
 * - VS Code 风格文件图标
 * - 展开/折叠目录
 * - 右键上下文菜单
 * - 文件搜索过滤
 */
export function FileTree({
  workspacePath,
  onFileClick,
  onContextMenu,
  className,
  filterKeyword,
}: FileTreeProps) {
  const inFlightRef = useRef<Set<string>>(new Set())
  const [entriesByPath, setEntriesByPath] = useState<
    Record<string, Pick<ListEntriesResponse, 'directories' | 'files'>>
  >({})
  const entriesByPathRef = useRef(entriesByPath)
  const [nodeLoadingByPath, setNodeLoadingByPath] = useState<Record<string, boolean>>({})
  const [nodeErrorByPath, setNodeErrorByPath] = useState<Record<string, string | null>>({})

  useEffect(() => {
    entriesByPathRef.current = entriesByPath
  }, [entriesByPath])

  // 重置所有条目
  const resetEntries = useCallback(() => {
    inFlightRef.current.clear()
    setEntriesByPath({})
    entriesByPathRef.current = {}
    setNodeLoadingByPath({})
    setNodeErrorByPath({})
  }, [])

  // 加载目录内容
  const ensureEntries = useCallback(async (path: string) => {
    const normalizedPath = path.trim()
    if (!normalizedPath) return
    if (entriesByPathRef.current[normalizedPath]) return
    if (inFlightRef.current.has(normalizedPath)) return

    inFlightRef.current.add(normalizedPath)
    setNodeLoadingByPath((s) => ({ ...s, [normalizedPath]: true }))
    setNodeErrorByPath((s) => ({ ...s, [normalizedPath]: null }))
    try {
      const data = await api.fs.listEntries(normalizedPath)
      setEntriesByPath((s) => {
        const next = {
          ...s,
          [normalizedPath]: { directories: data.directories, files: data.files },
          [data.currentPath]: { directories: data.directories, files: data.files },
        }
        entriesByPathRef.current = next
        return next
      })
    } catch (e) {
      setNodeErrorByPath((s) => ({ ...s, [normalizedPath]: (e as Error).message }))
    } finally {
      inFlightRef.current.delete(normalizedPath)
      setNodeLoadingByPath((s) => ({ ...s, [normalizedPath]: false }))
    }
  }, [])

  // 使缓存失效（供外部调用刷新文件树）
  const invalidateFsCache = useCallback(
    (changedPath: string) => {
      const changedNorm = normalizePathForComparison(changedPath)
      const parentPath = getParentPath(changedPath)
      const parentNorm = parentPath ? normalizePathForComparison(parentPath) : null

      const shouldRemove = (key: string) => {
        const keyNorm = normalizePathForComparison(key)
        if (parentNorm && keyNorm === parentNorm) return true
        if (keyNorm === changedNorm) return true
        return keyNorm.startsWith(`${changedNorm}\\`) || keyNorm.startsWith(`${changedNorm}/`)
      }

      setEntriesByPath((s) => {
        const next: typeof s = {}
        for (const [key, value] of Object.entries(s)) {
          if (!shouldRemove(key)) next[key] = value
        }
        entriesByPathRef.current = next
        return next
      })

      setNodeLoadingByPath((s) => {
        const next: typeof s = {}
        for (const [key, value] of Object.entries(s)) {
          if (!shouldRemove(key)) next[key] = value
        }
        return next
      })

      setNodeErrorByPath((s) => {
        const next: typeof s = {}
        for (const [key, value] of Object.entries(s)) {
          if (!shouldRemove(key)) next[key] = value
        }
        return next
      })

      if (parentPath) {
        void ensureEntries(parentPath)
      }
    },
    [ensureEntries],
  )

  // 暴露刷新方法供外部使用
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _invalidateFsCache = invalidateFsCache

  // 初始化加载根目录
  useEffect(() => {
    resetEntries()
    const rootPath = workspacePath.trim()
    if (!rootPath) return
    void ensureEntries(rootPath)
  }, [ensureEntries, resetEntries, workspacePath])

  // 过滤文件和目录
  const filterEntries = useCallback(
    (
      directories: DirectoryEntryDto[],
      files: FileEntryDto[],
    ): { directories: DirectoryEntryDto[]; files: FileEntryDto[] } => {
      if (!filterKeyword?.trim()) {
        return { directories, files }
      }
      const keyword = filterKeyword.toLowerCase().trim()
      return {
        directories: directories.filter((d) => d.name.toLowerCase().includes(keyword)),
        files: files.filter((f) => f.name.toLowerCase().includes(keyword)),
      }
    },
    [filterKeyword],
  )

  // 渲染文件项
  const renderFile = useCallback(
    (file: FileEntryDto) => {
      const iconUrl = getVscodeFileIconUrl(file.name)
      return (
        <FileItem
          key={file.fullPath}
          icon={iconUrl ? buildVscodeIconImg(iconUrl) : undefined}
          onClick={() => onFileClick?.(file.fullPath)}
          onDoubleClick={() => onFileClick?.(file.fullPath)}
          onContextMenu={(e) =>
            onContextMenu?.(e, { kind: 'file', name: file.name, fullPath: file.fullPath })
          }
        >
          {file.name}
        </FileItem>
      )
    },
    [onFileClick, onContextMenu],
  )

  // 渲染目录项
  const renderDirectory = useCallback(
    (dir: DirectoryEntryDto) => {
      const children = entriesByPath[dir.fullPath]
      const nodeLoading = Boolean(nodeLoadingByPath[dir.fullPath])
      const nodeError = nodeErrorByPath[dir.fullPath]
      const icons = getVscodeFolderIconUrls(dir.name)

      // 过滤子项
      const filteredChildren = children ? filterEntries(children.directories, children.files) : null

      return (
        <FolderItem key={dir.fullPath} value={dir.fullPath}>
          <FolderTrigger
            closeIcon={buildVscodeIconImg(icons.closed)}
            openIcon={buildVscodeIconImg(icons.open)}
            onClick={(e) => {
              e.stopPropagation()
              void ensureEntries(dir.fullPath)
            }}
            onContextMenu={(e) =>
              onContextMenu?.(e, { kind: 'directory', name: dir.name, fullPath: dir.fullPath })
            }
          >
            {dir.name}
          </FolderTrigger>

          <FolderContent>
            {nodeError ? (
              <div className="px-2 py-2 text-sm text-destructive">{nodeError}</div>
            ) : null}

            {nodeLoading ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">加载中…</div>
            ) : null}

            {!nodeLoading && filteredChildren ? (
              <div className="space-y-1">
                {filteredChildren.directories.length || filteredChildren.files.length ? null : (
                  <div className="px-2 py-2 text-sm text-muted-foreground">暂无内容</div>
                )}

                {filteredChildren.directories.length ? (
                  <SubFiles>{filteredChildren.directories.map(renderDirectory)}</SubFiles>
                ) : null}

                {filteredChildren.files.length ? (
                  <div className="px-2">{filteredChildren.files.map(renderFile)}</div>
                ) : null}
              </div>
            ) : null}
          </FolderContent>
        </FolderItem>
      )
    },
    [
      ensureEntries,
      entriesByPath,
      filterEntries,
      nodeErrorByPath,
      nodeLoadingByPath,
      onContextMenu,
      renderFile,
    ],
  )

  // 根目录内容
  const rootPath = workspacePath.trim()
  const rootEntries = rootPath ? entriesByPath[rootPath] : undefined
  const nodeLoading = Boolean(nodeLoadingByPath[rootPath])
  const nodeError = nodeErrorByPath[rootPath]

  // 过滤根目录内容
  const filteredRootEntries = useMemo(() => {
    if (!rootEntries) return null
    return filterEntries(rootEntries.directories, rootEntries.files)
  }, [rootEntries, filterEntries])

  // 渲染根目录视图
  const rootFilesView = useMemo(() => {
    if (!rootPath) {
      return <div className="px-4 py-6 text-sm text-muted-foreground">未设置工作空间</div>
    }

    if (nodeError) {
      return <div className="px-4 py-6 text-sm text-destructive">{nodeError}</div>
    }

    if (nodeLoading || !filteredRootEntries) {
      return <div className="px-4 py-6 text-sm text-muted-foreground">加载中…</div>
    }

    if (!filteredRootEntries.directories.length && !filteredRootEntries.files.length) {
      return (
        <div className="px-4 py-6 text-sm text-muted-foreground">
          {filterKeyword?.trim() ? '没有匹配的文件' : '暂无文件'}
        </div>
      )
    }

    return (
      <Files>
        {filteredRootEntries.directories.map(renderDirectory)}
        {filteredRootEntries.files.map(renderFile)}
      </Files>
    )
  }, [
    rootPath,
    nodeError,
    nodeLoading,
    filteredRootEntries,
    filterKeyword,
    renderDirectory,
    renderFile,
  ])

  return (
    <div
      className={cn('h-full overflow-auto', className)}
      onContextMenu={(e) => {
        if (!rootPath) return
        onContextMenu?.(e, {
          kind: 'directory',
          name: getBaseName(rootPath),
          fullPath: rootPath,
        })
      }}
    >
      {rootFilesView}
    </div>
  )
}

// 导出刷新函数的 hook
export function useFileTreeRefresh() {
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  return { refreshKey, refresh }
}
