import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/api/client'
import type { DirectoryEntryDto, DriveDto, ListDirectoriesResponse } from '@/api/types'
import {
  Files,
  FolderContent,
  FolderItem,
  FolderTrigger,
  SubFiles,
} from '@/components/animate-ui/components/radix/files'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/Modal'

export function DirectoryPicker({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (path: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [drives, setDrives] = useState<DriveDto[]>([])
  const [loadingDrives, setLoadingDrives] = useState(false)
  const [loadingListing, setLoadingListing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pathInput, setPathInput] = useState(value)
  const [selectedPath, setSelectedPath] = useState(value)
  const [listing, setListing] = useState<ListDirectoriesResponse | null>(null)

  const openModal = () => {
    if (disabled) return
    setPathInput(value)
    setSelectedPath(value)
    setOpen(true)
  }

  const closeModal = () => setOpen(false)

  const inFlightRef = useRef<Set<string>>(new Set())
  const [childrenByPath, setChildrenByPath] = useState<Record<string, DirectoryEntryDto[]>>({})
  const [nodeLoadingByPath, setNodeLoadingByPath] = useState<Record<string, boolean>>({})
  const [nodeErrorByPath, setNodeErrorByPath] = useState<Record<string, string | null>>({})

  const loadDrives = useCallback(async () => {
    setLoadingDrives(true)
    try {
      const data = await api.fs.drives()
      setDrives(data)
      return data
    } finally {
      setLoadingDrives(false)
    }
  }, [])

  const loadListing = useCallback(async (path: string) => {
    setLoadingListing(true)
    setError(null)
    setChildrenByPath({})
    setNodeLoadingByPath({})
    setNodeErrorByPath({})
    inFlightRef.current.clear()
    try {
      const data = await api.fs.listDirectories(path)
      setListing(data)
      setPathInput(data.currentPath)
      setSelectedPath(data.currentPath)
    } catch (e) {
      setError((e as Error).message)
      setListing(null)
    } finally {
      setLoadingListing(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setError(null)
    setListing(null)
    setChildrenByPath({})
    setNodeLoadingByPath({})
    setNodeErrorByPath({})
    inFlightRef.current.clear()

    const run = async () => {
      try {
        const data = await loadDrives()
        const initial = value.trim() || data[0]?.rootPath
        if (initial) {
          await loadListing(initial)
        }
      } catch (e) {
        setError((e as Error).message)
      }
    }

    void run()
  }, [open, value, loadDrives, loadListing])

  const ensureChildren = useCallback(
    async (path: string) => {
      if (childrenByPath[path]) return
      if (inFlightRef.current.has(path)) return

      inFlightRef.current.add(path)
      setNodeLoadingByPath((s) => ({ ...s, [path]: true }))
      setNodeErrorByPath((s) => ({ ...s, [path]: null }))
      try {
        const data = await api.fs.listDirectories(path)
        setChildrenByPath((s) => ({ ...s, [data.currentPath]: data.directories }))
      } catch (e) {
        setNodeErrorByPath((s) => ({ ...s, [path]: (e as Error).message }))
      } finally {
        inFlightRef.current.delete(path)
        setNodeLoadingByPath((s) => ({ ...s, [path]: false }))
      }
    },
    [childrenByPath],
  )

  const loading = loadingDrives || loadingListing
  const canSelect = useMemo(() => Boolean(selectedPath.trim()), [selectedPath])

  const renderDirectory = (dir: DirectoryEntryDto) => {
    const children = childrenByPath[dir.fullPath]
    const nodeLoading = Boolean(nodeLoadingByPath[dir.fullPath])
    const nodeError = nodeErrorByPath[dir.fullPath]

    return (
      <FolderItem key={dir.fullPath} value={dir.fullPath}>
        <FolderTrigger
          onClick={(e) => {
            e.stopPropagation()
            setSelectedPath(dir.fullPath)
            setPathInput(dir.fullPath)
            void ensureChildren(dir.fullPath)
          }}
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

          {!nodeLoading && children && children.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">暂无子目录</div>
          ) : null}

          {children?.length ? <SubFiles>{children.map(renderDirectory)}</SubFiles> : null}
        </FolderContent>
      </FolderItem>
    )
  }

  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="选择工作空间目录"
        disabled={disabled}
      />
      <Button type="button" variant="outline" onClick={openModal} disabled={disabled}>
        浏览
      </Button>

      <Modal open={open} title="选择工作空间目录" onClose={closeModal} className="max-w-3xl">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {drives.map((d) => (
              <Button
                key={d.rootPath}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadListing(d.rootPath)}
              >
                {d.name}
              </Button>
            ))}
          </div>

          <div className="flex gap-2">
            <Input value={pathInput} onChange={(e) => setPathInput(e.target.value)} />
            <Button type="button" variant="outline" onClick={() => void loadListing(pathInput)}>
              进入
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => listing?.parentPath && void loadListing(listing.parentPath)}
              disabled={!listing?.parentPath}
            >
              上一级
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              {error}
            </div>
          )}

          <div className="rounded-lg border">
            <div className="border-b px-3 py-2 text-xs text-muted-foreground">
              {listing?.currentPath ?? '未选择目录'}
              {loading ? '（加载中…）' : ''}
            </div>
            {listing ? (
              listing.directories.length ? (
                <Files className="max-h-[360px]">
                  {listing.directories.map(renderDirectory)}
                </Files>
              ) : (
                <div className="px-2 py-6 text-sm text-muted-foreground">暂无子目录</div>
              )
            ) : (
              <div className="px-2 py-6 text-sm text-muted-foreground">
                {loading ? '加载中…' : '请选择一个目录'}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeModal}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!selectedPath.trim()) return
                onChange(selectedPath)
                closeModal()
              }}
              disabled={!canSelect}
            >
              选择此目录
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
