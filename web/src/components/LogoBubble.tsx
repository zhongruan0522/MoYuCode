import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

const FUN_MESSAGES = [
  '🚀 OneCode 助你一臂之力！',
  '💡 今天想写点什么代码？',
  '⚡ 让编码变得更高效！',
  '🎯 专注于创造，交给我来处理',
  '🌟 代码如诗，优雅如你',
  '🔥 让我们开始编码吧！',
  '💻 你的AI编程助手',
  '🎨 创造力 × AI = 无限可能',
  '🚧 正在构建未来的代码...',
  '☕ 该休息一下了吗？',
  '🎪 编程也可以很有趣！',
  '🌈 让代码像彩虹一样绚丽',
  '🎸 像摇滚明星一样写代码！',
  '🧠 AI + 人类 = 超级组合',
  '🎲 每一行代码都是一次冒险',
  '⭐ 你是今天的主角！',
  '🌸 代码花园需要精心呵护',
  '🎭 编程是一门艺术',
  '🦄 相信奇迹，创造奇迹',
  '🌙 深夜编码模式启动',
  '🍀 今天也是充满希望的一天',
  '🎁 每次点击都是一份惊喜',
  '🌊 在代码的海洋中遨游',
  '🎯 精准定位，高效开发',
  '💎 代码品质如钻石般闪耀',
  '🌻 茁壮成长的项目',
  '🎨 用代码描绘美好未来',
  '🦾 强大的代码肌肉',
  '🎉 享受编程的乐趣',
  '🌟 让创意闪耀光芒',
]

const IDLE_MESSAGES = [
  '写得很棒，继续加油！',
  '小步前进也很了不起。',
  '你可以的！下一行代码等你。',
  '灵感来了就敲一行吧。',
  '今天的你也很有创造力。',
  '慢慢来，保持节奏就好。',
]

const CLICK_DISPLAY_MS = 3000
const IDLE_DISPLAY_MS = 15000
const IDLE_DELAY_MS = 60000
const CLOSE_ANIMATION_MS = 200

export function LogoBubble() {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const bubbleRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLButtonElement>(null)
  const [animatingOut, setAnimatingOut] = useState(false)
  const [showSparkle, setShowSparkle] = useState(false)
  const closeStartTimeoutRef = useRef<number | null>(null)
  const closeFinishTimeoutRef = useRef<number | null>(null)
  const idleTimeoutRef = useRef<number | null>(null)
  const isOpenRef = useRef(false)

  const clearCloseTimers = useCallback(() => {
    if (closeStartTimeoutRef.current !== null) {
      window.clearTimeout(closeStartTimeoutRef.current)
      closeStartTimeoutRef.current = null
    }
    if (closeFinishTimeoutRef.current !== null) {
      window.clearTimeout(closeFinishTimeoutRef.current)
      closeFinishTimeoutRef.current = null
    }
  }, [])

  const closeBubble = useCallback(() => {
    if (!isOpenRef.current) return
    clearCloseTimers()
    setAnimatingOut(true)
    closeFinishTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false)
      setAnimatingOut(false)
      isOpenRef.current = false
    }, CLOSE_ANIMATION_MS)
  }, [clearCloseTimers])

  const scheduleAutoClose = useCallback(
    (delayMs: number) => {
      clearCloseTimers()
      closeStartTimeoutRef.current = window.setTimeout(() => {
        setAnimatingOut(true)
        closeFinishTimeoutRef.current = window.setTimeout(() => {
          setIsOpen(false)
          setAnimatingOut(false)
          isOpenRef.current = false
        }, CLOSE_ANIMATION_MS)
      }, delayMs)
    },
    [clearCloseTimers],
  )

  const openBubble = useCallback(
    (nextMessage: string, autoCloseMs: number) => {
      setMessage(nextMessage)
      if (logoRef.current) {
        const rect = logoRef.current.getBoundingClientRect()
        setPosition({
          top: rect.top + 8,
          left: rect.right + 8,
        })
      }
      setIsOpen(true)
      setAnimatingOut(false)
      isOpenRef.current = true
      scheduleAutoClose(autoCloseMs)
    },
    [scheduleAutoClose],
  )

  const handleClick = () => {
    // Trigger sparkle effect
    setShowSparkle(true)
    window.setTimeout(() => setShowSparkle(false), 600)

    if (isOpenRef.current) {
      closeBubble()
      return
    }

    const randomMessage = FUN_MESSAGES[Math.floor(Math.random() * FUN_MESSAGES.length)]
    openBubble(randomMessage, CLICK_DISPLAY_MS)
  }

  const resetIdleTimer = useCallback(() => {
    if (idleTimeoutRef.current !== null) {
      window.clearTimeout(idleTimeoutRef.current)
    }
    idleTimeoutRef.current = window.setTimeout(() => {
      if (isOpenRef.current) {
        resetIdleTimer()
        return
      }
      const randomMessage = IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)]
      openBubble(randomMessage, IDLE_DISPLAY_MS)
    }, IDLE_DELAY_MS)
  }, [openBubble])

  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        bubbleRef.current &&
        !bubbleRef.current.contains(event.target as Node) &&
        !logoRef.current?.contains(event.target as Node)
      ) {
        closeBubble()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [closeBubble])

  useEffect(() => {
    const handleActivity = () => {
      resetIdleTimer()
    }

    resetIdleTimer()
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel']
    events.forEach((event) => window.addEventListener(event, handleActivity))

    return () => {
      events.forEach((event) => window.removeEventListener(event, handleActivity))
      if (idleTimeoutRef.current !== null) {
        window.clearTimeout(idleTimeoutRef.current)
        idleTimeoutRef.current = null
      }
      clearCloseTimers()
    }
  }, [clearCloseTimers, resetIdleTimer])

  return (
    <>
      <button
        ref={logoRef}
        type="button"
        onClick={handleClick}
        className="relative mb-4 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-accent/20 transition-all hover:ring-accent/50 hover:scale-105 active:scale-95 animate-pulse-slow"
        aria-label="点击查看惊喜"
      >
        <img
          src="/favicon.png"
          alt="OneCode Logo"
          className="size-full object-cover"
        />
        {showSparkle && (
          <>
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <span className="absolute -top-1 -right-1 size-3 animate-bounce">✨</span>
            <span className="absolute -bottom-1 -left-1 size-2 animate-bounce delay-100">💫</span>
          </>
        )}
      </button>

      {isOpen && (
        <div
          ref={bubbleRef}
          className={cn(
            'fixed z-50 max-w-xs rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 px-4 py-3 shadow-lg backdrop-blur-sm transition-all duration-200',
            animatingOut
              ? 'opacity-0 scale-95 translate-x-[-8px]'
              : 'opacity-100 scale-100 translate-x-0 animate-in slide-in-from-left-2 fade-in duration-300'
          )}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
        >
          {/* Arrow */}
          <div className="absolute left-[-6px] top-4">
            <div
              className="h-3 w-3 rotate-45 border-l border-t border-primary/20 bg-gradient-to-br from-primary/10 to-background"
              style={{
                transform: 'rotate(45deg)',
              }}
            />
          </div>

          {/* Message */}
          <p className="relative z-10 text-sm font-medium text-foreground animate-in fade-in duration-500">
            {message}
          </p>

          {/* Decorative elements */}
          <div className="absolute right-2 top-2 size-2 rounded-full bg-primary/20 animate-pulse" />
          <div className="absolute bottom-2 left-2 size-1.5 rounded-full bg-primary/10 animate-pulse delay-150" />
          <div className="absolute right-4 bottom-3 text-[8px] opacity-50">✨</div>
        </div>
      )}
    </>
  )
}
