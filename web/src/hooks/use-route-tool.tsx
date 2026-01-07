import * as React from 'react';
import { useLocation } from 'react-router-dom';
import type { ToolKey, ToolType } from '@/api/types';

export type RouteToolMode = 'codex' | 'claude';

export type RouteToolInfo = {
  mode: RouteToolMode;
  toolType: ToolType;
  toolKey: ToolKey;
  isCodexRoute: boolean;
  isClaudeRoute: boolean;
};

const matchesRoutePrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const resolveRouteTool = (pathname: string): RouteToolInfo => {
  const isClaudeRoute = matchesRoutePrefix(pathname, '/claude');
  const isCodexRoute =
    matchesRoutePrefix(pathname, '/code') || matchesRoutePrefix(pathname, '/codex');

  const mode: RouteToolMode = isClaudeRoute ? 'claude' : 'codex';
  const toolType: ToolType = isClaudeRoute ? 'ClaudeCode' : 'Codex';
  const toolKey: ToolKey = isClaudeRoute ? 'claude' : 'codex';

  return { mode, toolType, toolKey, isCodexRoute, isClaudeRoute };
};

export function useRouteTool(): RouteToolInfo {
  const { pathname } = useLocation();
  return React.useMemo(() => resolveRouteTool(pathname), [pathname]);
}
