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
import { Search, RefreshCw } from 'lucide-react'

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

      {/* Header with search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">技能市场</h1>
          <p className="text-sm text-muted-foreground">
            发现和浏览可用的技能 ({filteredSkills.length}/{skills.length})
          </p>
        </div>

        {/* Search input */}
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
      </div>

      {/* Skills grid */}
      {filteredSkills.length > 0 ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          data-testid="skills-grid"
        >
          {filteredSkills.map((skill) => (
            <SkillCard 
              key={skill.slug} 
              skill={skill} 
              installedStatus={installedMap[skill.slug]}
              onInstall={handleInstall} 
            />
          ))}
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center" data-testid="no-results">
          <p className="text-sm text-muted-foreground">
            没有找到匹配的技能
          </p>
        </div>
      )}

      {/* Refresh button when online */}
      {isOnline && (
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
