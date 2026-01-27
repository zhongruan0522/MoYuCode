import { useEffect, useState, useSyncExternalStore } from 'react'

// Task 7.2: Offline detection hook
// Detects network connectivity and provides online/offline status

function getSnapshot(): boolean {
  return navigator.onLine
}

function getServerSnapshot(): boolean {
  // Always return true on server (SSR)
  return true
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/**
 * Hook to detect online/offline status
 * Uses the browser's navigator.onLine API and listens for online/offline events
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Hook that provides online status with additional utilities
 */
export function useNetworkStatus() {
  const isOnline = useOnlineStatus()
  const [wasOffline, setWasOffline] = useState(false)
  const [lastOnlineAt, setLastOnlineAt] = useState<Date | null>(null)

  useEffect(() => {
    if (isOnline) {
      if (wasOffline) {
        // Just came back online
        setLastOnlineAt(new Date())
      }
      setWasOffline(false)
    } else {
      setWasOffline(true)
    }
  }, [isOnline, wasOffline])

  return {
    isOnline,
    isOffline: !isOnline,
    wasOffline,
    lastOnlineAt,
  }
}

// Queue for operations to retry when connection is restored
type QueuedOperation = {
  id: string
  operation: () => Promise<void>
  retryCount: number
  maxRetries: number
}

const operationQueue: QueuedOperation[] = []
let isProcessingQueue = false

/**
 * Queue an operation to be retried when the connection is restored
 */
export function queueOperationForRetry(
  id: string,
  operation: () => Promise<void>,
  maxRetries = 3
): void {
  // Remove any existing operation with the same ID
  const existingIndex = operationQueue.findIndex((op) => op.id === id)
  if (existingIndex >= 0) {
    operationQueue.splice(existingIndex, 1)
  }

  operationQueue.push({
    id,
    operation,
    retryCount: 0,
    maxRetries,
  })
}

/**
 * Process queued operations when back online
 */
async function processQueue(): Promise<void> {
  if (isProcessingQueue || !navigator.onLine) return
  isProcessingQueue = true

  while (operationQueue.length > 0 && navigator.onLine) {
    const op = operationQueue[0]
    try {
      await op.operation()
      operationQueue.shift() // Remove successful operation
    } catch (e) {
      op.retryCount++
      if (op.retryCount >= op.maxRetries) {
        console.error(`Operation ${op.id} failed after ${op.maxRetries} retries:`, e)
        operationQueue.shift() // Remove failed operation
      } else {
        // Move to end of queue for retry
        operationQueue.shift()
        operationQueue.push(op)
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000 * op.retryCount))
      }
    }
  }

  isProcessingQueue = false
}

// Listen for online event to process queue
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void processQueue()
  })
}
