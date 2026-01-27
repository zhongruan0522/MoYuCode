import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SkillDto, SkillInstalledStatusDto } from '@/api/types'
import { Download, Check, Sparkles, RefreshCw } from 'lucide-react'

export interface SkillCardProps {
  skill: SkillDto
  installedStatus?: SkillInstalledStatusDto
  onInstall?: (skill: SkillDto) => void
}

const statusConfig: Record<string, { label: string; className: string; icon?: string }> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  deprecated: {
    label: 'Deprecated',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  experimental: {
    label: 'Beta',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
}

export function SkillCard({ skill, installedStatus, onInstall }: SkillCardProps) {
  const [viewService, setViewService] = useState<'codex' | 'claudeCode'>('codex')
  const [isHovered, setIsHovered] = useState(false)
  
  const status = statusConfig[skill.status] ?? {
    label: skill.status,
    className: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
  }

  const canInstall = skill.services.codex.compatible || skill.services.claudeCode.compatible
  const isInstalledCodex = installedStatus?.codex ?? false
  const isInstalledClaudeCode = installedStatus?.claudeCode ?? false
  const hasAnyInstalled = isInstalledCodex || isInstalledClaudeCode

  return (
    <div 
      className={cn(
        "group relative rounded-xl border bg-card p-5 transition-all duration-300 ease-out",
        "hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1",
        "hover:border-primary/20",
        hasAnyInstalled && "ring-1 ring-emerald-500/20"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Gradient overlay on hover */}
      <div className={cn(
        "absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-transparent",
        "opacity-0 transition-opacity duration-300",
        isHovered && "opacity-100"
      )} />

      {/* Content */}
      <div className="relative">
        {/* Header: Name + Status */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-300",
              "bg-gradient-to-br from-primary/10 to-primary/5",
              "group-hover:from-primary/20 group-hover:to-primary/10",
              "group-hover:scale-110"
            )}>
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-semibold text-base leading-tight group-hover:text-primary transition-colors duration-200">
              {skill.name}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasAnyInstalled && (
              <Badge 
                className={cn(
                  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                  "transition-all duration-200 hover:bg-emerald-500/20"
                )}
              >
                <Check className="w-3 h-3 mr-1" />
                已安装
              </Badge>
            )}
            <Badge
              data-testid={`status-${skill.status}`}
              className={cn('transition-all duration-200', status.className)}
            >
              {status.label}
            </Badge>
          </div>
        </div>

        {/* Summary */}
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
          {skill.summary}
        </p>

        {/* Tags */}
        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {skill.tags.slice(0, 4).map((tag) => (
              <Badge 
                key={tag} 
                variant="secondary" 
                className={cn(
                  "text-xs px-2 py-0.5 transition-all duration-200",
                  "hover:bg-secondary/80 cursor-default"
                )}
              >
                {tag}
              </Badge>
            ))}
            {skill.tags.length > 4 && (
              <Badge 
                variant="secondary" 
                className="text-xs px-2 py-0.5 opacity-60"
              >
                +{skill.tags.length - 4}
              </Badge>
            )}
          </div>
        )}

        {/* Installed Status Panel */}
        {hasAnyInstalled && (
          <div className={cn(
            "mb-4 p-3 rounded-lg transition-all duration-300",
            "bg-gradient-to-r from-muted/50 to-muted/30",
            "border border-border/50"
          )}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">安装状态</span>
              <div className="flex gap-1 p-0.5 rounded-md bg-background/50">
                <button
                  type="button"
                  onClick={() => setViewService('codex')}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-md transition-all duration-200 font-medium',
                    viewService === 'codex'
                      ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400 shadow-sm'
                      : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                  )}
                >
                  Codex
                </button>
                <button
                  type="button"
                  onClick={() => setViewService('claudeCode')}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-md transition-all duration-200 font-medium',
                    viewService === 'claudeCode'
                      ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400 shadow-sm'
                      : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                  )}
                >
                  Claude Code
                </button>
              </div>
            </div>
            <div className={cn(
              "flex items-center gap-2 text-xs transition-all duration-200",
              "animate-in fade-in-0 slide-in-from-left-1"
            )} key={viewService}>
              {viewService === 'codex' ? (
                isInstalledCodex ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    已安装到 Codex
                  </span>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                    未安装到 Codex
                  </span>
                )
              ) : (
                isInstalledClaudeCode ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    已安装到 Claude Code
                  </span>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                    未安装到 Claude Code
                  </span>
                )
              )}
            </div>
          </div>
        )}

        {/* Footer: Version + Compatibility + Install */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <span className="text-xs text-muted-foreground font-mono">v{skill.version}</span>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {skill.services.codex.compatible && (
                <Badge
                  data-testid="codex-compatible"
                  variant="outline"
                  className={cn(
                    "text-xs transition-all duration-200 cursor-default",
                    isInstalledCodex 
                      ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 shadow-sm shadow-purple-500/10" 
                      : "bg-purple-500/5 text-purple-600/70 dark:text-purple-400/70 border-purple-500/20 hover:bg-purple-500/10"
                  )}
                >
                  {isInstalledCodex && <Check className="w-3 h-3 mr-0.5" />}
                  Codex
                </Badge>
              )}
              {skill.services.claudeCode.compatible && (
                <Badge
                  data-testid="claudecode-compatible"
                  variant="outline"
                  className={cn(
                    "text-xs transition-all duration-200 cursor-default",
                    isInstalledClaudeCode 
                      ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 shadow-sm shadow-orange-500/10" 
                      : "bg-orange-500/5 text-orange-600/70 dark:text-orange-400/70 border-orange-500/20 hover:bg-orange-500/10"
                  )}
                >
                  {isInstalledClaudeCode && <Check className="w-3 h-3 mr-0.5" />}
                  Claude
                </Badge>
              )}
            </div>
            {onInstall && (
              <Button
                size="sm"
                variant={hasAnyInstalled ? "outline" : "default"}
                disabled={!canInstall}
                onClick={() => onInstall(skill)}
                className={cn(
                  "h-7 px-3 text-xs font-medium transition-all duration-200",
                  "hover:scale-105 active:scale-95",
                  !hasAnyInstalled && "shadow-sm shadow-primary/20"
                )}
                title={canInstall ? (hasAnyInstalled ? '重新安装' : '安装技能') : '此技能不兼容任何服务'}
              >
                {hasAnyInstalled ? (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1" />
                    重装
                  </>
                ) : (
                  <>
                    <Download className="w-3 h-3 mr-1" />
                    安装
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
