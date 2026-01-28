# 工作区布局重新设计 - 设计文档

## 架构概述

### 整体布局结构

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Header (可选，独立模式)                         │
├────┬─────────────────────────────────────────────────────────────────┤
│    │                                                                  │
│ A  │                      主工作区容器                                 │
│ c  │  ┌─────────────────────────────────────────────────────────────┐│
│ t  │  │                                                             ││
│ i  │  │   侧边栏 (Sidebar)          编辑器区域 (Editor Area)         ││
│ v  │  │   ┌─────────────┐          ┌─────────────────────────────┐ ││
│ i  │  │   │ 文件树      │          │ Tab 标签栏                   │ ││
│ t  │  │   │ 搜索面板    │    ↔     │ ─────────────────────────── │ ││
│ y  │  │   │ Git 面板    │  可拖拽   │ 编辑器内容                   │ ││
│    │  │   │             │          │ (Monaco Editor)             │ ││
│ B  │  │   └─────────────┘          └─────────────────────────────┘ ││
│ a  │  │                                      ↕ 可拖拽               ││
│ r  │  │   ┌─────────────────────────────────────────────────────┐  ││
│    │  │   │              底部面板 (Panel)                        │  ││
│    │  │   │  [终端] [输出] [问题]                                │  ││
│    │  │   │  ─────────────────────────────────────────────────  │  ││
│    │  │   │  终端内容 / 输出内容                                  │  ││
│    │  │   └─────────────────────────────────────────────────────┘  ││
│    │  └─────────────────────────────────────────────────────────────┘│
└────┴─────────────────────────────────────────────────────────────────┘
```

### 组件层次结构

```
WorkspaceLayout
├── ActivityBar                    # 活动栏（视图切换）
│   ├── ActivityBarItem            # 单个活动项
│   └── ActivityBarIndicator       # 当前激活指示器
│
├── WorkspaceMain                  # 主工作区
│   ├── Sidebar                    # 侧边栏
│   │   ├── SidebarHeader          # 侧边栏标题
│   │   ├── FileExplorer           # 文件资源管理器
│   │   │   ├── FileTree           # 文件树
│   │   │   └── FileTreeItem       # 文件/文件夹项
│   │   ├── SearchPanel            # 搜索面板
│   │   │   ├── SearchInput        # 搜索输入框
│   │   │   └── SearchResults      # 搜索结果列表
│   │   └── GitPanel               # Git 面板
│   │
│   ├── ResizeHandle               # 拖拽调整大小手柄
│   │
│   └── EditorArea                 # 编辑器区域
│       ├── EditorTabs             # 编辑器标签栏
│       │   └── EditorTab          # 单个标签
│       ├── EditorContent          # 编辑器内容
│       │   ├── MonacoEditor       # Monaco 编辑器
│       │   ├── DiffViewer         # Diff 查看器
│       │   └── WelcomeView        # 欢迎视图
│       │
│       ├── ResizeHandle           # 垂直拖拽手柄
│       │
│       └── BottomPanel            # 底部面板
│           ├── PanelTabs          # 面板标签栏
│           ├── TerminalPanel      # 终端面板
│           │   ├── TerminalTabs   # 终端标签
│           │   └── TerminalView   # 终端视图
│           └── OutputPanel        # 输出面板
│
└── QuickOpen                      # 快速打开弹窗
    ├── QuickOpenInput             # 搜索输入
    └── QuickOpenList              # 结果列表
```

## 状态管理设计

### 使用 Zustand 管理工作区状态

```typescript
// stores/workspaceStore.ts

interface WorkspaceState {
  // 活动栏状态
  activeView: 'explorer' | 'search' | 'git' | 'terminal'
  
  // 侧边栏状态
  sidebarVisible: boolean
  sidebarWidth: number
  
  // 编辑器状态
  openTabs: EditorTab[]
  activeTabId: string | null
  
  // 底部面板状态
  panelVisible: boolean
  panelHeight: number
  activePanelTab: 'terminal' | 'output' | 'problems'
  
  // 终端状态
  terminals: TerminalInstance[]
  activeTerminalId: string | null
  
  // 搜索状态
  searchQuery: string
  searchResults: SearchResult[]
  
  // 快速打开状态
  quickOpenVisible: boolean
  
  // Actions
  setActiveView: (view: WorkspaceState['activeView']) => void
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  openFile: (path: string) => void
  closeTab: (tabId: string) => void
  // ... 更多 actions
}
```

### 编辑器标签页类型

```typescript
interface EditorTab {
  id: string
  kind: 'file' | 'diff' | 'preview' | 'welcome'
  title: string
  path?: string
  dirty?: boolean
  iconUrl?: string
}
```

### 终端实例类型

```typescript
interface TerminalInstance {
  id: string
  title: string
  cwd: string
  status: 'connecting' | 'connected' | 'closed' | 'error'
}
```

## 组件详细设计

### 1. ActivityBar 组件

```typescript
interface ActivityBarProps {
  activeView: string
  onViewChange: (view: string) => void
}

const activityItems = [
  { id: 'explorer', icon: Files, label: '资源管理器', shortcut: 'Ctrl+Shift+E' },
  { id: 'search', icon: Search, label: '搜索', shortcut: 'Ctrl+Shift+F' },
  { id: 'git', icon: GitBranch, label: 'Git', shortcut: 'Ctrl+Shift+G' },
  { id: 'terminal', icon: Terminal, label: '终端', shortcut: 'Ctrl+`' },
]
```

**样式规范：**
- 宽度：48px
- 图标大小：24px
- 背景色：`bg-muted/30`
- 激活指示器：左侧 2px 宽的主题色条

### 2. Sidebar 组件

```typescript
interface SidebarProps {
  visible: boolean
  width: number
  activeView: string
  onWidthChange: (width: number) => void
}
```

**布局规范：**
- 最小宽度：200px
- 最大宽度：容器宽度的 50%
- 默认宽度：280px
- 折叠动画：300ms ease-out

### 3. FileExplorer 组件

```typescript
interface FileExplorerProps {
  workspacePath: string
  onOpenFile: (path: string) => void
  onOpenTerminal: (path: string) => void
}
```

**功能：**
- 懒加载文件夹内容
- 虚拟滚动优化大量文件
- 右键上下文菜单
- 拖拽移动文件

### 4. SearchPanel 组件

```typescript
interface SearchPanelProps {
  onResultClick: (result: SearchResult) => void
}

interface SearchResult {
  filePath: string
  lineNumber: number
  lineContent: string
  matchStart: number
  matchEnd: number
}
```

**功能：**
- 防抖搜索（300ms）
- 正则表达式支持
- 大小写敏感切换
- 搜索结果分组显示

### 5. EditorTabs 组件

```typescript
interface EditorTabsProps {
  tabs: EditorTab[]
  activeTabId: string | null
  onTabClick: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabReorder: (fromIndex: number, toIndex: number) => void
}
```

**功能：**
- 拖拽排序
- 滚动溢出处理
- 中键点击关闭
- 右键菜单（关闭、关闭其他、关闭所有）

### 6. BottomPanel 组件

```typescript
interface BottomPanelProps {
  visible: boolean
  height: number
  activeTab: string
  onHeightChange: (height: number) => void
  onTabChange: (tab: string) => void
}
```

**布局规范：**
- 最小高度：100px
- 最大高度：容器高度的 70%
- 默认高度：200px

### 7. QuickOpen 组件

```typescript
interface QuickOpenProps {
  visible: boolean
  onClose: () => void
  onSelect: (item: QuickOpenItem) => void
}

interface QuickOpenItem {
  type: 'file' | 'command'
  label: string
  description?: string
  path?: string
}
```

**功能：**
- 模糊匹配
- 最近文件优先
- 键盘导航
- 高亮匹配字符

## 快捷键设计

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+P` | 快速打开文件 |
| `Ctrl+Shift+E` | 聚焦文件资源管理器 |
| `Ctrl+Shift+F` | 打开搜索面板 |
| `Ctrl+Shift+G` | 打开 Git 面板 |
| `Ctrl+\`` | 切换终端面板 |
| `Ctrl+Shift+\`` | 新建终端 |
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+J` | 切换底部面板 |
| `Ctrl+W` | 关闭当前标签页 |
| `Ctrl+Tab` | 切换到下一个标签页 |

## 文件结构

```
web/src/
├── components/
│   └── workspace/
│       ├── ActivityBar.tsx
│       ├── Sidebar.tsx
│       ├── FileExplorer.tsx
│       ├── FileTree.tsx
│       ├── SearchPanel.tsx
│       ├── GitPanel.tsx
│       ├── EditorArea.tsx
│       ├── EditorTabs.tsx
│       ├── EditorContent.tsx
│       ├── BottomPanel.tsx
│       ├── TerminalPanel.tsx
│       ├── OutputPanel.tsx
│       ├── QuickOpen.tsx
│       ├── ResizeHandle.tsx
│       └── index.ts
├── stores/
│   └── workspaceStore.ts
├── hooks/
│   ├── useWorkspaceKeyboard.ts
│   └── useResizable.ts
└── pages/
    └── ProjectWorkspacePage.tsx  # 重构
```

## 正确性属性

### P1: 侧边栏宽度约束
侧边栏宽度始终在 [minWidth, maxWidth] 范围内。

### P2: 标签页唯一性
同一文件路径只能打开一个标签页。

### P3: 终端生命周期
终端关闭时必须正确释放资源。

### P4: 布局状态持久化
用户的布局偏好在页面刷新后保持不变。

## 迁移策略

1. **Phase 1**: 创建新的组件结构，不影响现有功能
2. **Phase 2**: 实现核心布局组件（ActivityBar, Sidebar, EditorArea）
3. **Phase 3**: 迁移现有功能到新组件
4. **Phase 4**: 添加新功能（搜索、快捷键等）
5. **Phase 5**: 清理旧代码，完成迁移
