import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/api/client'
import type { SkillDto, SkillsInstalledMap } from '@/api/types'
import { SkillCard } from '@/components/SkillCard'
import { SkillInstallModal } from '@/components/SkillInstallModal'
import { OfflineIndicator } from '@/components/OfflineIndicator'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Search, RefreshCw, Trash2, Store, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'

type TabType = 'market' | 'codex' | 'claudeCode'

type InstalledSkillInfo = {
  name: string
  skill: SkillDto | null
}

/**
 * Filter skills based on search query
 * Searches in name, summary, description, and tags (case-insensitive)
 */
export function filterSkills(skills: SkillDto[], query: string): SkillDto[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return skills

  return skills.filter((skill) => {
    const nameMatch = skill.name.toLowerCase().includes(trimmed)
    const summaryMatch = skill.summary.toLowerCase().includes(trimmed)
    const descriptionMatch = skill.description.toLowerCase().includes(trimmed)
    const tagsMatch = skill.tags.some((tag) => tag.toLowerCase().includes(trimmed))
    return nameMatch || summaryMatch || descriptionMatch || tagsMatch
  })
}

export function SkillsPage() {
  const [skills, setSkills] = useState<SkillDto[]>([])
  const [installedMap, setInstalledMap] = useState<SkillsInstalledMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [installModalOpen, setInstallModalOpen] = useState(false)
  const [selectedSkill, setSelectedSkill] = useState<SkillDto | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('market')
  const [uninstalling, setUninstalling] = useState<string | null>(null)

  const isOnline = useOnlineStatus()

  const loadSkills = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [skillsResponse, installedResponse] = await Promise.all([
        api.skills.list(),
        api.skills.installed(),
      ])
      setSkills(skillsResponse.skills)
      setInstalledMap(installedResponse)
    } catch (e) {
      const message = e instanceof Error ? e.message : '加载技能失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadInstalledStatus = useCallback(async () => {
    try {
      const installedResponse = await api.skills.installed()
      setInstalledMap(installedResponse)
    } catch {
      // Silently fail - installed status is not critical
    }
  }, [])

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  const filteredSkills = useMemo(
    () => filterSkills(skills, searchQuery),
    [skills, searchQuery]
  )

  // Get installed skills for specific service
  const getInstalledSkills = useCallback((service: 'codex' | 'claudeCode'): InstalledSkillInfo[] => {
    const result: InstalledSkillInfo[] = []
    for (const [name, status] of Object.entries(installedMap)) {
      if ((service === 'codex' && status.codex) || (service === 'claudeCode' && status.claudeCode)) {
        const skill = skills.find(s => {
          const skillName = s.slug.includes('/') ? s.slug.split('/').pop()! : s.slug
          return skillName === name
        })
        result.push({ name, skill: skill ?? null })
      }
    }
    return result
  }, [installedMap, skills])

  const codexInstalledSkills = useMemo(() => getInstalledSkills('codex'), [getInstalledSkills])
  const claudeInstalledSkills = useMemo(() => getInstalledSkills('claudeCode'), [getInstalledSkills])

  const handleRetry = useCallback(() => {
    void loadSkills()
  }, [loadSkills])

  const handleInstall = useCallback((skill: SkillDto) => {
    setSelectedSkill(skill)
    setInstallModalOpen(true)
  }, [])

  const handleInstallModalClose = useCallback(() => {
    setInstallModalOpen(false)
    setSelectedSkill(null)
  }, [])

  const handleInstallComplete = useCallback(() => {
    // Refresh installed status after installation
    void loadInstalledStatus()
  }, [loadInstalledStatus])

  const handleUninstall = useCallback(async (skillName: string, service: 'codex' | 'claudeCode') => {
    setUninstalling(`${skillName}-${service}`)
    try {
      await api.skills.uninstall(skillName, service)
      await loadInstalledStatus()
    } catch (e) {
      console.error('Failed to uninstall skill:', e)
    } finally {
      setUninstalling(null)
    }
  }, [loadInstalledStatus])

  // Loading state
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" data-testid="loading-state">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="size-8" />
          <span className="text-sm text-muted-foreground">加载技能中...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-full items-center justify-center" data-testid="error-state">
        <div className="max-w-md space-y-4 text-center">
          <div className="text-sm font-medium text-destructive">加载失败</div>
          <div className="text-xs text-muted-foreground">{error}</div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            className="gap-2"
          >
            <RefreshCw className="size-4" />
            重试
          </Button>
        </div>
        <OfflineIndicator />
      </div>
    )
  }

  // Empty state
  if (skills.length === 0) {
    return (
      <div className="flex h-full items-center justify-center" data-testid="empty-state">
        <div className="max-w-md space-y-4 text-center">
          <div className="text-sm text-muted-foreground">暂无可用技能</div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            className="gap-2"
          >
            <RefreshCw className="size-4" />
            刷新
          </Button>
        </div>
        <OfflineIndicator />
      </div>
    )
  }

  return (
    <div className="h-full space-y-6">
      {/* Offline indicator */}
      <OfflineIndicator />

      {/* Header with search and tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">技能市场</h1>
          <p className="text-sm text-muted-foreground">
            {activeTab === 'market' 
              ? `发现和浏览可用的技能 (${filteredSkills.length}/${skills.length})`
              : activeTab === 'codex'
              ? `Codex 已安装 (${codexInstalledSkills.length})`
              : `Claude Code 已安装 (${claudeInstalledSkills.length})`
            }
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab switcher */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50">
            <button
              type="button"
              onClick={() => setActiveTab('market')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                activeTab === 'market'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              )}
            >
              <Store className="w-3.5 h-3.5" />
              市场
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('codex')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                activeTab === 'codex'
                  ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              )}
            >
              <Terminal className="w-3.5 h-3.5" />
              Codex
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('claudeCode')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                activeTab === 'claudeCode'
                  ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              )}
            >
              <Terminal className="w-3.5 h-3.5" />
              Claude
            </button>
          </div>

          {/* Search input - only show in market tab */}
          {activeTab === 'market' && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="搜索技能..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="search-input"
              />
            </div>
          )}
        </div>
      </div>

      {/* Skills grid - Market tab */}
      {activeTab === 'market' && (
        <>
          {filteredSkills.length > 0 ? (
            <div
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              data-testid="skills-grid"
            >
              {filteredSkills.map((skill) => {
                const skillName = skill.slug.includes('/') ? skill.slug.split('/').pop()! : skill.slug
                return (
                  <SkillCard 
                    key={skill.slug} 
                    skill={skill} 
                    installedStatus={installedMap[skillName]}
                    onInstall={handleInstall} 
                  />
                )
              })}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center" data-testid="no-results">
              <p className="text-sm text-muted-foreground">
                没有找到匹配的技能
              </p>
            </div>
          )}
        </>
      )}

      {/* Installed skills - Codex tab */}
      {activeTab === 'codex' && (
        <>
          {codexInstalledSkills.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {codexInstalledSkills.map(({ name, skill }) => (
                <div
                  key={name}
                  className="group relative rounded-xl border bg-card p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10">
                        <Terminal className="w-4 h-4 text-purple-500" />
                      </div>
                      <h3 className="font-semibold text-base">{skill?.name ?? name}</h3>
                    </div>
                  </div>
                  {skill && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {skill.summary}
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t border-border/50">
                    <span className="text-xs text-muted-foreground font-mono">
                      {skill ? `v${skill.version}` : name}
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-3 text-xs"
                      disabled={uninstalling === `${name}-codex`}
                      onClick={() => handleUninstall(name, 'codex')}
                    >
                      {uninstalling === `${name}-codex` ? (
                        <Spinner className="w-3 h-3" />
                      ) : (
                        <>
                          <Trash2 className="w-3 h-3 mr-1" />
                          卸载
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Codex 暂无已安装的技能
              </p>
            </div>
          )}
        </>
      )}

      {/* Installed skills - Claude Code tab */}
      {activeTab === 'claudeCode' && (
        <>
          {claudeInstalledSkills.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {claudeInstalledSkills.map(({ name, skill }) => (
                <div
                  key={name}
                  className="group relative rounded-xl border bg-card p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-orange-500/10">
                        <Terminal className="w-4 h-4 text-orange-500" />
                      </div>
                      <h3 className="font-semibold text-base">{skill?.name ?? name}</h3>
                    </div>
                  </div>
                  {skill && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {skill.summary}
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t border-border/50">
                    <span className="text-xs text-muted-foreground font-mono">
                      {skill ? `v${skill.version}` : name}
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-3 text-xs"
                      disabled={uninstalling === `${name}-claudeCode`}
                      onClick={() => handleUninstall(name, 'claudeCode')}
                    >
                      {uninstalling === `${name}-claudeCode` ? (
                        <Spinner className="w-3 h-3" />
                      ) : (
                        <>
                          <Trash2 className="w-3 h-3 mr-1" />
                          卸载
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Claude Code 暂无已安装的技能
              </p>
            </div>
          )}
        </>
      )}

      {/* Refresh button when online - only in market tab */}
      {isOnline && activeTab === 'market' && (
        <div className="flex justify-center pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRetry}
            className="gap-2 text-muted-foreground"
          >
            <RefreshCw className="size-4" />
            刷新列表
          </Button>
        </div>
      )}

      {/* Install Modal */}
      {selectedSkill && (
        <SkillInstallModal
          skill={selectedSkill}
          open={installModalOpen}
          onClose={handleInstallModalClose}
          onInstallComplete={handleInstallComplete}
        />
      )}
    </div>
  )
}
