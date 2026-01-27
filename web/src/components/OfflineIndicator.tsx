import { useEffect, useState } from 'react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { cn } from '@/lib/utils'
import { WifiOff } from 'lucide-react'

// Task 7.2: Offline indicator component
// Shows a visual indicator when the user is offline

type OfflineIndicatorProps = {
  className?: string
  showWhenOnline?: boolean
}

export function OfflineIndicator({ className, showWhenOnline = false }: OfflineIndicatorProps) {
  const isOnline = useOnlineStatus()
  const [showReconnected, setShowReconnected] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true)
    } else if (wasOffline) {
      // Just came back online, show reconnected message briefly
      setShowReconnected(true)
      const timer = setTimeout(() => {
        setShowReconnected(false)
        setWasOffline(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [isOnline, wasOffline])

  // Don't render anything if online and not showing reconnected message
  if (isOnline && !showReconnected && !showWhenOnline) {
    return null
  }

  if (showReconnected) {
    return (
      <div
        className={cn(
          'fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform',
          'flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-sm text-white shadow-lg',
          'animate-in fade-in slide-in-from-bottom-4 duration-300',
          className
        )}
        role="status"
        aria-live="polite"
      >
        <span className="inline-flex size-2 rounded-full bg-green-300" />
        <span>已恢复连接</span>
      </div>
    )
  }

  if (!isOnline) {
    return (
      <div
        className={cn(
          'fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform',
          'flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-sm text-white shadow-lg',
          'animate-in fade-in slide-in-from-bottom-4 duration-300',
          className
        )}
        role="alert"
        aria-live="assertive"
      >
        <WifiOff className="size-4" />
        <span>网络已断开</span>
      </div>
    )
  }

  return null
}

// Compact version for use in headers/toolbars
export function OfflineIndicatorCompact({ className }: { className?: string }) {
  const isOnline = useOnlineStatus()

  if (isOnline) {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md bg-amber-600/10 px-2 py-1 text-xs text-amber-600',
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <WifiOff className="size-3" />
      <span>离线</span>
    </div>
  )
}
