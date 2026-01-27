import { useCallback, useEffect, useRef, useState } from 'react'

// Task 7.3: Instance count tracking using BroadcastChannel
// Tracks how many project workspace instances are open across tabs

type InstanceMessage = {
  type: 'instance-register' | 'instance-unregister' | 'instance-ping' | 'instance-pong'
  instanceId: string
  projectId?: string
}

// Create BroadcastChannel for instance tracking (if supported)
const instanceChannel: BroadcastChannel | null = (() => {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      return new BroadcastChannel('myyucode:instance-tracking')
    }
  } catch {
    // BroadcastChannel not supported
  }
  return null
})()

// Track known instances
const knownInstances = new Map<string, { projectId?: string; lastSeen: number }>()

// Cleanup stale instances (not seen in 10 seconds)
function cleanupStaleInstances(): void {
  const now = Date.now()
  const staleThreshold = 10000 // 10 seconds
  for (const [id, info] of knownInstances) {
    if (now - info.lastSeen > staleThreshold) {
      knownInstances.delete(id)
    }
  }
}

/**
 * Hook to track and report instance count
 */
export function useInstanceTracking(instanceId: string, projectId?: string) {
  const [instanceCount, setInstanceCount] = useState(1)
  const [projectInstanceCount, setProjectInstanceCount] = useState(1)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const updateCounts = useCallback(() => {
    cleanupStaleInstances()
    setInstanceCount(knownInstances.size + 1) // +1 for self

    if (projectId) {
      let count = 1 // Start with self
      for (const [, info] of knownInstances) {
        if (info.projectId === projectId) {
          count++
        }
      }
      setProjectInstanceCount(count)
    }
  }, [projectId])

  useEffect(() => {
    if (!instanceChannel) return

    // Register this instance
    const registerMessage: InstanceMessage = {
      type: 'instance-register',
      instanceId,
      projectId,
    }
    instanceChannel.postMessage(registerMessage)

    // Handle messages from other instances
    const handleMessage = (event: MessageEvent<InstanceMessage>) => {
      const message = event.data
      if (!message?.type || message.instanceId === instanceId) return

      switch (message.type) {
        case 'instance-register':
        case 'instance-pong':
          knownInstances.set(message.instanceId, {
            projectId: message.projectId,
            lastSeen: Date.now(),
          })
          updateCounts()
          // Respond to register with pong
          if (message.type === 'instance-register') {
            const pongMessage: InstanceMessage = {
              type: 'instance-pong',
              instanceId,
              projectId,
            }
            instanceChannel.postMessage(pongMessage)
          }
          break

        case 'instance-unregister':
          knownInstances.delete(message.instanceId)
          updateCounts()
          break

        case 'instance-ping':
          // Respond to ping
          const pongMessage: InstanceMessage = {
            type: 'instance-pong',
            instanceId,
            projectId,
          }
          instanceChannel.postMessage(pongMessage)
          break
      }
    }

    instanceChannel.addEventListener('message', handleMessage)

    // Periodically ping to keep track of active instances
    pingIntervalRef.current = setInterval(() => {
      const pingMessage: InstanceMessage = {
        type: 'instance-ping',
        instanceId,
        projectId,
      }
      instanceChannel.postMessage(pingMessage)
      cleanupStaleInstances()
      updateCounts()
    }, 5000)

    // Cleanup on unmount
    return () => {
      instanceChannel.removeEventListener('message', handleMessage)

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = null
      }

      // Unregister this instance
      const unregisterMessage: InstanceMessage = {
        type: 'instance-unregister',
        instanceId,
        projectId,
      }
      instanceChannel.postMessage(unregisterMessage)
    }
  }, [instanceId, projectId, updateCounts])

  return {
    instanceCount,
    projectInstanceCount,
    hasMultipleInstances: instanceCount > 1,
    hasMultipleProjectInstances: projectInstanceCount > 1,
  }
}

/**
 * Get current instance count (non-reactive, for one-time checks)
 */
export function getInstanceCount(): number {
  cleanupStaleInstances()
  return knownInstances.size + 1
}
