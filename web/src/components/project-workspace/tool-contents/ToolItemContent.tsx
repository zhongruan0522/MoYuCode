import { memo } from 'react'
import { ClaudeAskUserQuestionTool } from '@/components/project-workspace/ClaudeAskUserQuestionTool'
import { ClaudeTodoWriteTool } from '@/components/project-workspace/ClaudeTodoWriteTool'
import { TaskToolContent } from '@/components/project-workspace/tool-contents/TaskToolContent'
import { WriteToolContent } from '@/components/project-workspace/tool-contents/WriteToolContent'
import { ReadToolContent } from '@/components/project-workspace/tool-contents/ReadToolContent'
import { EditToolContent } from '@/components/project-workspace/tool-contents/EditToolContent'
import { BashToolContent } from '@/components/project-workspace/tool-contents/BashToolContent'
import { GlobToolContent } from '@/components/project-workspace/tool-contents/GlobToolContent'
import { GrepToolContent } from '@/components/project-workspace/tool-contents/GrepToolContent'
import { DefaultToolContent } from '@/components/project-workspace/tool-contents/DefaultToolContent'
import { ToolOutputContent } from '@/components/project-workspace/tool-contents/ToolOutputContent'
import { EnterPlanModeToolContent, ExitPlanModeToolContent } from '@/components/project-workspace/tool-contents/PlanModeToolContent'
import type { ToolInputData } from '@/components/project-workspace/tool-inputs/useToolInputParsers'

interface ToolItemContentProps {
  inputData: ToolInputData
  output: string
  isError: boolean
  readCode: string | null
  editDiff: string
  planContent: string | null
  message: {
    id: string
    toolUseId?: string
  }
  askUserQuestionDisabled: boolean
  onSubmitAskUserQuestion?: (toolUseId: string, answers: Record<string, string>, messageId: string) => void
  onComposeAskUserQuestion?: (answers: Record<string, string>) => void
}

export const ToolItemContent = memo(function ToolItemContent({
  inputData,
  output,
  isError,
  readCode,
  editDiff,
  planContent,
  message,
  askUserQuestionDisabled,
  onSubmitAskUserQuestion,
  onComposeAskUserQuestion,
}: ToolItemContentProps) {
  const { taskInput, askInput, writeInput, readInput, editInput, todoWriteInput, bashInput, globInput, grepInput, enterPlanModeInput, exitPlanModeInput } = inputData

  const askAlreadyAnswered = Boolean(
    askInput?.answers &&
      Object.values(askInput.answers).some((value) => typeof value === 'string' && value.trim()),
  )
  const hasAskHandler = Boolean(onSubmitAskUserQuestion || onComposeAskUserQuestion)
  const askDisabled = askUserQuestionDisabled || askAlreadyAnswered || !hasAskHandler

  const shouldShowOutput = Boolean(
    output &&
    !editInput &&
    !bashInput &&
    !globInput &&
    !grepInput &&
    !enterPlanModeInput &&
    !exitPlanModeInput &&
    (!todoWriteInput || isError) &&
    (!readInput || isError) &&
    (!taskInput || isError)
  )

  return (
    <>
      {taskInput ? (
        <TaskToolContent input={taskInput} />
      ) : askInput ? (
        <ClaudeAskUserQuestionTool
          input={askInput}
          disabled={askDisabled}
          onSubmit={(answers) => {
            if (!message.toolUseId || !onSubmitAskUserQuestion) return
            onSubmitAskUserQuestion(message.toolUseId, answers, message.id)
          }}
          onComposeToInput={onComposeAskUserQuestion}
        />
      ) : writeInput ? (
        <WriteToolContent input={writeInput} />
      ) : readInput ? (
        <ReadToolContent input={readInput} code={readCode ?? ''} />
      ) : editInput ? (
        <EditToolContent input={editInput} diff={editDiff} />
      ) : bashInput ? (
        <BashToolContent input={bashInput} output={output} />
      ) : globInput ? (
        <GlobToolContent input={globInput} output={output} />
      ) : grepInput ? (
        <GrepToolContent input={grepInput} output={output} />
      ) : todoWriteInput ? (
        <ClaudeTodoWriteTool input={todoWriteInput} />
      ) : enterPlanModeInput ? (
        <EnterPlanModeToolContent input={enterPlanModeInput} />
      ) : exitPlanModeInput ? (
        <>
        <ExitPlanModeToolContent input={exitPlanModeInput} planContent={output} />
        </>
      ) : (
        <DefaultToolContent input={output || ''} />
      )}

      {shouldShowOutput ? (
        <ToolOutputContent output={output} />
      ) : null}
    </>
  )
})
