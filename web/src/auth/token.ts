import { useSyncExternalStore } from 'react'

const storageKey = 'moyucode_jwt_v1'
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) {
    listener()
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(storageKey, token)
  } catch {
    // ignore
  } finally {
    notify()
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // ignore
  } finally {
    notify()
  }
}

export function subscribeToken(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useToken() {
  return useSyncExternalStore(subscribeToken, getToken, getToken)
}
