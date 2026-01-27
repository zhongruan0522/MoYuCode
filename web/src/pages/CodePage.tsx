import { useMemo } from 'react'
import { ProjectListPage } from '@/pages/ProjectListPage'
import { useRouteTool } from '@/hooks/use-route-tool'

/**
 * CodePage - Thin wrapper that renders ProjectListPage based on the current route mode.
 *
 * This component determines whether we're in Codex or Claude Code mode based on the URL
 * and renders the appropriate ProjectListPage configuration.
 *
 * Routes:
 * - /code -> Codex mode
 * - /claude -> Claude Code mode
 *
 * When a project is selected, navigation goes to /projects/:id which renders
 * ProjectWorkspacePage directly.
 */
export function CodePage() {
  const routeTool = useRouteTool()
  const mode = useMemo(() => routeTool.mode, [routeTool.mode])

  return <ProjectListPage mode={mode} />
}
