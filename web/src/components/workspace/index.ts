/**
 * 工作区组件导出
 *
 * 这个模块导出所有工作区相关的组件，用于构建类似 VS Code 的现代化布局。
 */

// 布局组件
export { WorkspaceLayout } from './WorkspaceLayout'
export { ResizeHandle } from './ResizeHandle'

// 活动栏组件
export { ActivityBar } from './ActivityBar'

// 侧边栏组件
export { Sidebar } from './Sidebar'
export { FileExplorer } from './FileExplorer'
export { FileTree } from './FileTree'
export { SearchPanel } from './SearchPanel'
export { GitPanel } from './GitPanel'

// 编辑器区域组件
export { EditorArea } from './EditorArea'
export { EditorTabs } from './EditorTabs'
export { EditorContent } from './EditorContent'

// 底部面板组件
export { BottomPanel } from './BottomPanel'
export { TerminalPanel } from './TerminalPanel'
export { OutputPanel } from './OutputPanel'

// 快速打开组件
export { QuickOpen } from './QuickOpen'

// Hooks
export { useResizable } from '../../hooks/useResizable'
