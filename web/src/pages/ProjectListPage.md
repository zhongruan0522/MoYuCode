# ProjectListPage Component

## Overview
The `ProjectListPage` component displays a list of all user projects in a card-based grid layout. It is part of the project layout refactor that separates the monolithic CodePage into focused components.

## Features
- **Project List Display**: Shows all projects in a responsive grid using the `ProjectSelectionCard` component
- **Loading States**: Displays loading indicator during initial data fetch
- **Error Handling**: Shows error messages with retry option when project loading fails
- **Empty States**: Handles cases when no projects exist
- **Project Scanning**: Supports automatic and manual project scanning for Codex/Claude Code
- **Mode Support**: Works with both Codex (`/code`) and Claude Code (`/claude`) modes
- **Navigation**: Clicking a project card navigates to `/projects/:id`

## Props
```typescript
type ProjectListPageProps = {
  mode: 'codex' | 'claude'
}
```

## Usage
```tsx
import { ProjectListPage } from '@/pages/ProjectListPage'

// For Codex mode
<ProjectListPage mode="codex" />

// For Claude Code mode
<ProjectListPage mode="claude" />
```

## Implementation Details

### Data Fetching
- Fetches only project metadata (no sessions or environment details) for optimal performance
- Supports multiple tool types per mode (currently one per mode, but extensible)
- Merges and sorts projects by pinned status, then by update date

### Project Scanning
- Auto-scans on first load when no projects exist
- Manual scan can be triggered via the "扫描项目" button
- Displays real-time scan logs via EventSource
- Checks tool installation status before scanning

### Navigation
- Clicking a project card navigates to `/projects/:id`
- Future: Support Ctrl/Cmd+Click to open in new tab (Task 2.4)

### State Management
- Local component state for projects, loading, and scanning
- No global state dependencies
- Caches scan attempt to avoid repeated auto-scans

## Future Enhancements (Upcoming Tasks)
- **Task 2.5**: Add project management dialogs (create, edit, delete, rename)
- **Task 2.4**: Implement context menu and new tab navigation
- **Task 6.1**: Add cache invalidation when projects are modified

## Validates Requirements
- **Requirement 1.1**: Display projects in card-based grid layout
- **Requirement 1.2**: Fetch only project metadata
- **Requirement 1.5**: Support project scanning
- **Requirement 1.6**: Reuse ProjectSelectionCard component
- **Requirement 6.1**: Component reusability
- **Requirement 8.1**: Performance optimization (metadata only)

## Related Components
- `ProjectSelectionCard`: Renders the project grid and handles UI interactions
- `ProjectWorkspacePage`: Target page when a project is selected
- `CodePage`: Parent component that will render ProjectListPage (Task 5.1)
