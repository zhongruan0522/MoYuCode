import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * 拖拽方向类型
 */
export type ResizeDirection = 'horizontal' | 'vertical'

/**
 * ResizeHandle 组件属性
 */
export interface ResizeHandleProps {
  /** 拖拽方向：horizontal（水平，调整宽度）或 vertical（垂直，调整高度） */
  direction: ResizeDirection
  /** 当前尺寸值 */
  size: number
  /** 最小尺寸 */
  minSize: number
  /** 最大尺寸 */
  maxSize: number
  /** 尺寸变化回调 */
  onSizeChange: (newSize: number) => void
  /** 拖拽开始回调 */
  onDragStart?: () => void
  /** 拖拽结束回调 */
  onDragEnd?: () => void
  /** 是否反向计算（用于右侧或底部的面板） */
  inverted?: boolean
  /** 自定义类名 */
  className?: string
  /** 是否禁用 */
  disabled?: boolean
}

/**
 * ResizeHandle - 可拖拽调整大小的手柄组件
 *
 * 功能：
 * - 支持水平和垂直方向拖拽
 * - 拖拽时显示视觉反馈（高亮）
 * - 支持最小/最大值约束
 * - 支持反向计算（用于右侧或底部面板）
 *
 * 使用示例：
 * ```tsx
 * <ResizeHandle
 *   direction="horizontal"
 *   size={sidebarWidth}
 *   minSize={200}
 *   maxSize={500}
 *   onSizeChange={setSidebarWidth}
 * />
 * ```
 */
export function ResizeHandle({
  direction,
  size,
  minSize,
  maxSize,
  onSizeChange,
  onDragStart,
  onDragEnd,
  inverted = false,
  className,
  disabled = false,
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const startPosRef = useRef<number>(0)
  const startSizeRef = useRef<number>(0)

  /**
   * 约束尺寸在有效范围内
   */
  const constrainSize = useCallback(
    (newSize: number): number => {
      return Math.max(minSize, Math.min(maxSize, newSize))
    },
    [minSize, maxSize]
  )

  /**
   * 处理鼠标按下事件
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return

      e.preventDefault()
      e.stopPropagation()

      setIsDragging(true)
      startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY
      startSizeRef.current = size

      onDragStart?.()
    },
    [direction, size, disabled, onDragStart]
  )

  /**
   * 处理鼠标移动事件
   */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return

      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY
      const delta = currentPos - startPosRef.current

      // 根据方向和是否反向计算新尺寸
      const newSize = inverted
        ? startSizeRef.current - delta
        : startSizeRef.current + delta

      const constrainedSize = constrainSize(newSize)
      onSizeChange(constrainedSize)
    },
    [isDragging, direction, inverted, constrainSize, onSizeChange]
  )

  /**
   * 处理鼠标释放事件
   */
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      onDragEnd?.()
    }
  }, [isDragging, onDragEnd])

  /**
   * 注册全局鼠标事件监听器
   */
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      // 拖拽时禁用文本选择
      document.body.style.userSelect = 'none'
      document.body.style.cursor =
        direction === 'horizontal' ? 'col-resize' : 'row-resize'

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp, direction])

  // 是否显示高亮状态
  const isActive = isDragging || isHovered

  return (
    <div
      className={cn(
        // 基础样式
        'relative flex-shrink-0 transition-colors duration-150',
        // 方向相关样式
        direction === 'horizontal'
          ? 'w-1 cursor-col-resize hover:w-1'
          : 'h-1 cursor-row-resize hover:h-1',
        // 禁用状态
        disabled && 'cursor-not-allowed opacity-50',
        // 自定义类名
        className
      )}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="separator"
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      aria-valuenow={size}
      aria-valuemin={minSize}
      aria-valuemax={maxSize}
      tabIndex={disabled ? -1 : 0}
    >
      {/* 可视化的拖拽条 */}
      <div
        className={cn(
          'absolute transition-all duration-150',
          direction === 'horizontal'
            ? 'inset-y-0 left-0 w-1'
            : 'inset-x-0 top-0 h-1',
          // 高亮状态
          isActive
            ? 'bg-primary/60'
            : 'bg-transparent hover:bg-muted-foreground/20'
        )}
      />

      {/* 扩大的点击区域 */}
      <div
        className={cn(
          'absolute',
          direction === 'horizontal'
            ? 'inset-y-0 -left-1 -right-1 w-3'
            : 'inset-x-0 -top-1 -bottom-1 h-3'
        )}
      />
    </div>
  )
}
