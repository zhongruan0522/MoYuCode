import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { api } from '@/api/client'
import type { SkillDto } from '@/api/types'
import { Check, ChevronLeft, ChevronRight, Download, AlertCircle, RefreshCw } from 'lucide-react'

export interface SkillInstallModalProps {
  skill: SkillDto
  open: boolean
  onClose: () => void
  onInstallComplete?: () => void
}

type InstallStep = 'select-service' | 'confirm' | 'installing' | 'complete' | 'error'
type TargetService = 'codex' | 'claudeCode'

export function SkillInstallModal({ skill, open, onClose, onInstallComplete }: SkillInstallModalProps) {
  const [step, setStep] = useState<InstallStep>('select-service')
  const [selectedService, setSelectedService] = useState<TargetService | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [installedPath, setInstalledPath] = useState<string | null>(null)

  const canSelectCodex = skill.services.codex.compatible
  const canSelectClaudeCode = skill.services.claudeCode.compatible

  const handleClose = () => {
    // Reset state when closing
    setStep('select-service')
    setSelectedService(null)
    setError(null)
    setInstalledPath(null)
    onClose()
  }

  const handleInstall = async () => {
    if (!selectedService) return

    setStep('installing')
    setError(null)

    try {
      const result = await api.skills.install(skill.slug, selectedService)
      if (result.success) {
        setInstalledPath(result.installedPath)
        setStep('complete')
        onInstallComplete?.()
      } else {
        setError(result.errorMessage || '安装失败')
        setStep('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '安装失败，请重试')
      setStep('error')
    }
  }

  const handleRetry = () => {
    setStep('confirm')
    setError(null)
  }

  const getTitle = () => {
    switch (step) {
      case 'select-service':
        return '选择目标服务'
      case 'confirm':
        return '确认安装'
      case 'installing':
        return '正在安装...'
      case 'complete':
        return '安装完成'
      case 'error':
        return '安装失败'
    }
  }

  return (
    <Modal open={open} title={getTitle()} onClose={handleClose} className="max-w-md">
      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {['select-service', 'confirm', 'installing'].map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                step === s
                  ? 'bg-primary text-primary-foreground'
                  : ['complete', 'error'].includes(step) || 
                    (step === 'confirm' && s === 'select-service') ||
                    (step === 'installing' && ['select-service', 'confirm'].includes(s))
                  ? 'bg-green-500 text-white'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {(['complete', 'error'].includes(step) && s !== 'installing') ||
               (step === 'confirm' && s === 'select-service') ||
               (step === 'installing' && ['select-service', 'confirm'].includes(s)) ? (
                <Check className="w-4 h-4" />
              ) : (
                i + 1
              )}
            </div>
            {i < 2 && <div className="w-8 h-0.5 bg-muted mx-1" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {step === 'select-service' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            选择要安装 <span className="font-medium text-foreground">{skill.name}</span> 的目标服务：
          </p>
          <div className="space-y-2">
            <button
              type="button"
              disabled={!canSelectCodex}
              onClick={() => setSelectedService('codex')}
              className={cn(
                'w-full p-4 rounded-lg border text-left transition-colors',
                !canSelectCodex && 'opacity-50 cursor-not-allowed',
                selectedService === 'codex'
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-accent'
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Codex</div>
                  <div className="text-sm text-muted-foreground">安装到 ~/.codex/skills/.system/</div>
                </div>
                {canSelectCodex ? (
                  <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30">
                    兼容
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/30">
                    不兼容
                  </Badge>
                )}
              </div>
            </button>
            <button
              type="button"
              disabled={!canSelectClaudeCode}
              onClick={() => setSelectedService('claudeCode')}
              className={cn(
                'w-full p-4 rounded-lg border text-left transition-colors',
                !canSelectClaudeCode && 'opacity-50 cursor-not-allowed',
                selectedService === 'claudeCode'
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-accent'
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Claude Code</div>
                  <div className="text-sm text-muted-foreground">安装到 ~/.claude/skills/</div>
                </div>
                {canSelectClaudeCode ? (
                  <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30">
                    兼容
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/30">
                    不兼容
                  </Badge>
                )}
              </div>
            </button>
          </div>
          <div className="flex justify-end pt-4">
            <Button
              disabled={!selectedService}
              onClick={() => setStep('confirm')}
            >
              下一步
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">技能名称</span>
              <span className="text-sm font-medium">{skill.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">版本</span>
              <span className="text-sm font-medium">v{skill.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">目标服务</span>
              <span className="text-sm font-medium">
                {selectedService === 'codex' ? 'Codex' : 'Claude Code'}
              </span>
            </div>
            {skill.package?.files && (
              <div>
                <span className="text-sm text-muted-foreground">安装文件</span>
                <div className="mt-1 space-y-1">
                  {skill.package.files.map((file) => (
                    <div key={file.path} className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      {file.path}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setStep('select-service')}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              上一步
            </Button>
            <Button onClick={handleInstall}>
              <Download className="w-4 h-4 mr-1" />
              安装
            </Button>
          </div>
        </div>
      )}

      {step === 'installing' && (
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <Spinner className="w-8 h-8" />
          <p className="text-sm text-muted-foreground">正在下载并安装技能文件...</p>
        </div>
      )}

      {step === 'complete' && (
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center py-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
              <Check className="w-6 h-6 text-green-500" />
            </div>
            <p className="text-sm font-medium">安装成功！</p>
            {installedPath && (
              <p className="text-xs text-muted-foreground text-center break-all px-4">
                已安装到: {installedPath}
              </p>
            )}
          </div>
          <div className="flex justify-center pt-4">
            <Button onClick={handleClose}>完成</Button>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center py-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <p className="text-sm font-medium">安装失败</p>
            {error && (
              <p className="text-xs text-muted-foreground text-center px-4">{error}</p>
            )}
          </div>
          <div className="flex justify-center gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>关闭</Button>
            <Button onClick={handleRetry}>
              <RefreshCw className="w-4 h-4 mr-1" />
              重试
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
