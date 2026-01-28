import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 拖拽方向类型
 */
export type ResizeDirection = 'horizontal' | 'vertical'

/**
 * useResizable Hook 配置选项
 */
export interface UseResizableOptions {
  /** 初始尺寸 */
  initialSize: number
  /** 最小尺寸 */
  minSize: number
  /** 最大尺寸（可以是固定值或函数） */
  maxSize: number | (() => number)
  /** 拖拽方向 */
  direction: ResizeDirection
  /** 是否反向计算（用于右侧或底部的面板） */
  inverted?: boolean
  /** 尺寸变化回调 */
  onSizeChange?: (size: number) => void
  /** 拖拽开始回调 */
  onDragStart?: () => void
  /** 拖拽结束回调 */
  onDragEnd?: () => void
}

/**
 * useResizable Hook 返回值
 */
export interface UseResizableReturn {
  /** 当前尺寸 */
  size: number
  /** 是否正在拖拽 */
  isDragging: boolean
  /** 设置尺寸（会自动约束在有效范围内） */
  setSize: (size: number) => void
  /** 获取约束后的最大尺寸 */
  getMaxSize: () => number
  /** 拖拽处理函数，绑定到拖拽手柄元素 */
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void
    onTouchStart: (e: React.TouchEvent) => void
  }
  /** 重置为初始尺寸 */
  reset: () => void
}

/**
 * useResizable - 管理可拖拽调整大小的自定义 Hook
 *
 * 功能：
 * - 管理拖拽状态
 * - 处理鼠标和触摸事件
 * - 返回当前尺寸和拖拽处理函数
 * - 支持最小/最大值约束
 * - 支持反向计算（用于右侧或底部面板）
 *
 * 使用示例：
 * ```tsx
 * const { size, isDragging, handleProps } = useResizable({
 *   initialSize: 280,
 *   minSize: 200,
 *   maxSize: 500,
 *   direction: 'horizontal',
 *   onSizeChange: (newSize) => console.log('Size changed:', newSize),
 * })
 *
 * return (
 *   <div style={{ width: size }}>
 *     <div {...handleProps} className="resize-handle" />
 *   </div>
 * )
 * ```
 */
export function useResizable({
  initialSize,
  minSize,
  maxSize,
  direction,
  inverted = false,
  onSizeChange,
  onDragStart,
  onDragEnd,
}: UseResizableOptions): UseResizableReturn {
  const [size, setSizeState] = useState(initialSize)
  const [isDragging, setIsDragging] = useState(false)

  // 使用 ref 存储拖拽开始时的位置和尺寸
  const startPosRef = useRef<number>(0)
  const startSizeRef = useRef<number>(0)

  /**
   * 获取最大尺寸值
   */
  const getMaxSize = useCallback((): number => {
    return typeof maxSize === 'function' ? maxSize() : maxSize
  }, [maxSize])

  /**
   * 约束尺寸在有效范围内
   */
  const constrainSize = useCallback(
    (newSize: number): number => {
      const max = getMaxSize()
      return Math.max(minSize, Math.min(max, newSize))
    },
    [minSize, getMaxSize]
  )

  /**
   * 设置尺寸（会自动约束）
   */
  const setSize = useCallback(
    (newSize: number) => {
      const constrainedSize = constrainSize(newSize)
      setSizeState(constrainedSize)
      onSizeChange?.(constrainedSize)
    },
    [constrainSize, onSizeChange]
  )

  /**
   * 重置为初始尺寸
   */
  const reset = useCallback(() => {
    setSize(initialSize)
  }, [initialSize, setSize])

  /**
   * 获取事件的位置坐标
   */
  const getEventPosition = useCallback(
    (e: MouseEvent | TouchEvent): number => {
      if ('touches' in e) {
        return direction === 'horizontal'
          ? e.touches[0].clientX
          : e.touches[0].clientY
      }
      return direction === 'horizontal' ? e.clientX : e.clientY
    },
    [direction]
  )

  /**
   * 处理拖拽开始
   */
  const handleDragStart = useCallback(
    (clientPos: number) => {
      setIsDragging(true)
      startPosRef.current = clientPos
      startSizeRef.current = size
      onDragStart?.()
    },
    [size, onDragStart]
  )

  /**
   * 处理鼠标按下事件
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = direction === 'horizontal' ? e.clientX : e.clientY
      handleDragStart(pos)
    },
    [direction, handleDragStart]
  )

  /**
   * 处理触摸开始事件
   */
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation()
      const pos =
        direction === 'horizontal'
          ? e.touches[0].clientX
          : e.touches[0].clientY
      handleDragStart(pos)
    },
    [direction, handleDragStart]
  )

  /**
   * 处理拖拽移动
   */
  const handleMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return

      const currentPos = getEventPosition(e)
      const delta = currentPos - startPosRef.current

      // 根据方向和是否反向计算新尺寸
      const newSize = inverted
        ? startSizeRef.current - delta
        : startSizeRef.current + delta

      setSize(newSize)
    },
    [isDragging, inverted, getEventPosition, setSize]
  )

  /**
   * 处理拖拽结束
   */
  const handleEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      onDragEnd?.()
    }
  }, [isDragging, onDragEnd])

  /**
   * 注册全局事件监听器
   */
  useEffect(() => {
    if (isDragging) {
      // 鼠标事件
      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleEnd)

      // 触摸事件
      document.addEventListener('touchmove', handleMove, { passive: false })
      document.addEventListener('touchend', handleEnd)
      document.addEventListener('touchcancel', handleEnd)

      // 拖拽时禁用文本选择
      document.body.style.userSelect = 'none'
      document.body.style.cursor =
        direction === 'horizontal' ? 'col-resize' : 'row-resize'

      return () => {
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleEnd)
        document.removeEventListener('touchmove', handleMove)
        document.removeEventListener('touchend', handleEnd)
        document.removeEventListener('touchcancel', handleEnd)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
      }
    }
  }, [isDragging, handleMove, handleEnd, direction])

  return {
    size,
    isDragging,
    setSize,
    getMaxSize,
    handleProps: {
      onMouseDown: handleMouseDown,
      onTouchStart: handleTouchStart,
    },
    reset,
  }
}
