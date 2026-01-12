import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import App from './App.tsx'

// Import PWA service worker registration
import { registerSW } from 'virtual:pwa-register'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const pwaPromptKey = 'myyucode_pwa_install_prompted_v1'
const isStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as { standalone?: boolean }).standalone === true

const getPrompted = () => {
  try {
    return localStorage.getItem(pwaPromptKey) === '1'
  } catch {
    return false
  }
}

const setPrompted = () => {
  try {
    localStorage.setItem(pwaPromptKey, '1')
  } catch {
  }
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let promptListener: (() => void) | null = null

const shouldShowInstallPrompt = () =>
  !!deferredPrompt && !isStandaloneMode() && !getPrompted()

const notifyPromptReady = () => {
  promptListener?.()
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredPrompt = event as BeforeInstallPromptEvent
  notifyPromptReady()
})

window.addEventListener('appinstalled', () => {
  setPrompted()
  deferredPrompt = null
})

function PwaInstallPrompt() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const tryOpen = () => {
      if (!shouldShowInstallPrompt()) {
        return
      }

      setPrompted()
      setOpen(true)
    }

    promptListener = tryOpen
    tryOpen()

    return () => {
      if (promptListener === tryOpen) {
        promptListener = null
      }
    }
  }, [])

  const handleInstall = async () => {
    const prompt = deferredPrompt
    if (!prompt) {
      setOpen(false)
      return
    }

    deferredPrompt = null
    setOpen(false)

    try {
      await prompt.prompt()
      await prompt.userChoice
    } catch {
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>安装 MyYuCode（摸鱼Coding） 应用</AlertDialogTitle>
          <AlertDialogDescription>
            推荐安装为 PWA，以获得更流畅的体验和离线访问能力。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>稍后再说</AlertDialogCancel>
          <AlertDialogAction onClick={handleInstall}>立即安装</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Register service worker
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New content available. Reload to update?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('App is ready to work offline')
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <BrowserRouter>
        <PwaInstallPrompt />
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
