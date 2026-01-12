import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { ExternalLink, RefreshCw, Download } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

function parseVersion(version: string): number[] | null {
  const cleaned = version.trim().replace(/^v/i, '')
  const base = cleaned.split('-')[0]
  if (!base) return null
  const parts = base.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.some((part) => Number.isNaN(part))) return null
  return parts
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  if (!leftParts || !rightParts) return 0
  const maxLength = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0
    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }
  return 0
}

type ReleaseInfo = {
  tag_name: string
  name: string
  body: string
  html_url: string
  published_at: string
  assets: Array<{
    name: string
    browser_download_url: string
    size: number
  }>
}

export function AboutSection() {
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [checking, setChecking] = useState(false)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    api.app
      .version()
      .then((res) => {
        if (!cancelled) setAppVersion(res.version)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('https://api.github.com/repos/AIDotNet/MyYuCode/releases/latest', {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
      },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data) => {
        const version = typeof data?.tag_name === 'string' ? data.tag_name : null
        setLatestVersion(version)
      })
      .catch(() => {})
    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!appVersion || !latestVersion) {
      setUpdateAvailable(false)
      return
    }
    setUpdateAvailable(compareVersions(latestVersion, appVersion) > 0)
  }, [appVersion, latestVersion])

  const checkUpdate = () => {
    setChecking(true)
    const controller = new AbortController()
    fetch('https://api.github.com/repos/AIDotNet/MyYuCode/releases/latest', {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
      },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: ReleaseInfo) => {
        const version = typeof data?.tag_name === 'string' ? data.tag_name : null
        setLatestVersion(version)
        setReleaseInfo(data)

        // 如果有更新，自动显示弹窗
        if (version && appVersion && compareVersions(version, appVersion) > 0) {
          setShowUpdateDialog(true)
        }
      })
      .catch(() => {})
      .finally(() => {
        setChecking(false)
      })
    return () => {
      controller.abort()
    }
  }

  const handleUpdateClick = () => {
    if (updateAvailable && releaseInfo) {
      setShowUpdateDialog(true)
    } else {
      checkUpdate()
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatReleaseNotes = (body: string) => {
    // 简单的 Markdown 格式化
    return body
      .split('\n')
      .map((line) => {
        // 处理标题
        if (line.startsWith('## ')) {
          return `<h3 class="text-lg font-semibold mt-4 mb-2">${line.replace('## ', '')}</h3>`
        }
        if (line.startsWith('### ')) {
          return `<h4 class="text-base font-semibold mt-3 mb-1">${line.replace('### ', '')}</h4>`
        }
        // 处理列表
        if (line.trim().startsWith('- ')) {
          return `<li class="ml-4">${line.trim().replace('- ', '')}</li>`
        }
        // 处理链接
        return line.replace(
          /\[([^\]]+)\]\(([^)]+)\)/g,
          '<a href="$2" target="_blank" rel="noreferrer" class="text-primary hover:underline">$1</a>'
        )
      })
      .join('\n')
  }

  const getDownloadUrl = () => {
    if (!releaseInfo?.assets || releaseInfo.assets.length === 0) {
      return releaseInfo?.html_url
    }

    const platform = navigator.platform.toLowerCase()
    const isWindows = platform.includes('win')
    const isMac = platform.includes('mac') || platform.includes('darwin')
    const isLinux = platform.includes('linux')

    // 根据文件命名规则查找匹配的 asset
    // CI 生成的文件: MyYuCode-{version}-linux-x64.tar.gz, MyYuCode-{version}-osx-x64.tar.gz, MyYuCode-{version}-win-x64.zip
    const asset = releaseInfo.assets.find((a) => {
      const name = a.name.toLowerCase()

      if (isWindows && name.includes('win-x64.zip')) {
        return true
      }
      if (isMac && name.includes('osx-x64.tar.gz')) {
        return true
      }
      if (isLinux && name.includes('linux-x64.tar.gz')) {
        return true
      }
      return false
    })

    // 如果找到匹配的 asset，返回下载链接，否则返回 releases 页面
    return asset?.browser_download_url || releaseInfo.html_url
  }

  const getDownloadButtonText = () => {
    if (!releaseInfo?.assets || releaseInfo.assets.length === 0) {
      return '查看发布页面'
    }

    const platform = navigator.platform.toLowerCase()
    const isWindows = platform.includes('win')
    const isMac = platform.includes('mac') || platform.includes('darwin')
    const isLinux = platform.includes('linux')

    if (isWindows) return '下载 Windows 版本'
    if (isMac) return '下载 macOS 版本'
    if (isLinux) return '下载 Linux 版本'
    return '下载最新版本'
  }

  const handleDownload = () => {
    const downloadUrl = getDownloadUrl()

    if (!downloadUrl) return

    // 如果是 releases 页面 URL，则在新标签页打开
    if (downloadUrl.includes('github.com/AIDotNet/MyYuCode')) {
      window.open(downloadUrl, '_blank')
    } else {
      // 直接下载文件
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = '' // 让浏览器使用服务器提供的文件名
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }

    setShowUpdateDialog(false)
  }

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold mb-2">关于 MyYuCode（摸鱼Coding）</h2>
        <p className="text-sm text-muted-foreground">
          一个强大的 AI 编码助手集成平台
        </p>
      </div>

      {/* Project Info */}
      <div className="space-y-4">
        <div className="grid gap-4">
          {/* Version */}
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <div className="font-medium">版本</div>
              <div className="text-sm text-muted-foreground">当前应用程序版本</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-mono bg-muted px-3 py-1 rounded">
                {appVersion ? `v${appVersion}` : '未知'}
              </div>
              {updateAvailable && (
                <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-1 text-xs font-medium text-white">
                  有更新
                </span>
              )}
            </div>
          </div>

          {/* Update Check */}
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <div className="font-medium">更新检查</div>
              <div className="text-sm text-muted-foreground">
                {latestVersion ? `最新版本: ${latestVersion}` : '尚未检查'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleUpdateClick}
              disabled={checking}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`size-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? '检查中...' : updateAvailable ? '查看更新' : '检查更新'}
            </button>
          </div>

          {/* License */}
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <div className="font-medium">许可证</div>
              <div className="text-sm text-muted-foreground">开源许可协议</div>
            </div>
            <div className="text-sm font-mono bg-muted px-3 py-1 rounded">
              MIT License
            </div>
          </div>

          {/* Author */}
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <div className="font-medium">作者</div>
              <div className="text-sm text-muted-foreground">开发团队</div>
            </div>
            <div className="text-sm bg-muted px-3 py-1 rounded">
              AIDotNet
            </div>
          </div>

          {/* Repository */}
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <div className="font-medium">源代码仓库</div>
              <div className="text-sm text-muted-foreground">GitHub 仓库</div>
            </div>
            <a
              href="https://github.com/AIDotNet/MyYuCode"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              AIDotNet/MyYuCode
              <ExternalLink className="size-4" />
            </a>
          </div>

          {/* Description */}
          <div className="py-3">
            <div className="font-medium mb-2">项目简介</div>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                MyYuCode（摸鱼Coding）是一个双栈应用程序，为 AI 编码助手（Codex 和 Claude Code）提供 Web UI。
                后端是基于 ASP.NET Core Web API（net10.0）构建的，通过 JSON-RPC over stdio 与 OpenAI Codex 应用服务器集成。
                前端是使用 Vite + React + TypeScript 构建的 SPA，采用 Tailwind CSS 进行样式设计。
              </p>
              <p className="text-xs">
                主要功能：
              </p>
              <ul className="text-xs list-disc list-inside space-y-1 ml-2">
                <li>支持多个 AI 提供商（OpenAI、Gemini、xAI、DeepSeek 等）</li>
                <li>集成 Codex 和 Claude Code 工具</li>
                <li>项目管理和工作区功能</li>
                <li>实时会话可视化</li>
                <li>主题切换支持</li>
              </ul>
            </div>
          </div>

          {/* Tech Stack */}
          <div className="py-3">
            <div className="font-medium mb-2">技术栈</div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium text-foreground">后端</div>
                <div className="text-xs text-muted-foreground mt-1">
                  ASP.NET Core (net10.0)<br />
                  Entity Framework Core<br />
                  SQLite<br />
                  JSON-RPC
                </div>
              </div>
              <div>
                <div className="font-medium text-foreground">前端</div>
                <div className="text-xs text-muted-foreground mt-1">
                  React 19<br />
                  TypeScript<br />
                  Vite<br />
                  Tailwind CSS v4
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t">
        <p className="text-xs text-muted-foreground text-center">
          © 2025 AIDotNet. 基于 MIT 许可证开源。
        </p>
      </div>
    </div>

    {/* 更新弹窗 */}
    <AlertDialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-green-500 px-2 py-1 text-xs font-medium text-white">
              新版本可用
            </span>
            {releaseInfo?.tag_name}
          </AlertDialogTitle>
          <AlertDialogDescription>
            发现新版本 {releaseInfo?.tag_name}，当前版本 v{appVersion}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {/* 发布日期 */}
          {releaseInfo?.published_at && (
            <div className="text-sm text-muted-foreground">
              发布于 {formatDate(releaseInfo.published_at)}
            </div>
          )}

          {/* 更新内容 */}
          {releaseInfo?.body && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <div className="text-sm font-medium mb-2">更新内容</div>
              <div
                className="text-sm prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: formatReleaseNotes(releaseInfo.body)
                }}
              />
            </div>
          )}

          {/* 操作按钮 */}
          <AlertDialogFooter>
            <button
              type="button"
              onClick={() => setShowUpdateDialog(false)}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              稍后提醒
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Download className="size-4" />
              {getDownloadButtonText()}
            </button>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
