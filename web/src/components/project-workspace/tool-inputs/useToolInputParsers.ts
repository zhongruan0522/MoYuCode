import { useMemo } from 'react'
import type { TaskToolInput } from '@/components/project-workspace/tool-inputs/types'
import type { TodoWriteToolInput } from '@/components/project-workspace/tool-inputs/types'
import type { AskUserQuestionToolInput } from '@/components/project-workspace/tool-inputs/types'
import type { EnterPlanModeToolInput, ExitPlanModeToolInput } from '@/components/project-workspace/tool-inputs/types'
import {
  tryParseTaskToolInput,
  tryParseTodoWriteToolInput,
  tryParseAskUserQuestionToolInput,
  tryParseWriteToolInput,
  tryParseReadToolInput,
  tryParseEditToolInput,
  tryParseBashToolInput,
  tryParseGlobToolInput,
  tryParseGrepToolInput,
  tryParseEnterPlanModeToolInput,
  tryParseExitPlanModeToolInput,
  isTaskToolName,
  isTodoWriteToolName,
  isAskUserQuestionToolName,
  isWriteToolName,
  isReadToolName,
  isEditToolName,
  isBashToolName,
  isGlobToolName,
  isGrepToolName,
  isEnterPlanModeToolName,
  isExitPlanModeToolName,
} from '@/lib/toolInputParsers'
import type { WriteToolInput, ReadToolInput, EditToolInput, BashToolInput, GlobToolInput, GrepToolInput } from '@/lib/toolInputParsers'

export type ToolInputData = {
  taskInput: TaskToolInput | null
  askInput: AskUserQuestionToolInput | null
  writeInput: WriteToolInput | null
  readInput: ReadToolInput | null
  editInput: EditToolInput | null
  todoWriteInput: TodoWriteToolInput | null
  bashInput: BashToolInput | null
  globInput: GlobToolInput | null
  grepInput: GrepToolInput | null
  enterPlanModeInput: EnterPlanModeToolInput | null
  exitPlanModeInput: ExitPlanModeToolInput | null
}

export function useToolInputParsers(toolName: string, input: string): ToolInputData {
  return useMemo(() => {
    const base = {
      taskInput: null,
      askInput: null,
      writeInput: null,
      readInput: null,
      editInput: null,
      todoWriteInput: null,
      bashInput: null,
      globInput: null,
      grepInput: null,
      enterPlanModeInput: null,
      exitPlanModeInput: null,
    }

    if (isTaskToolName(toolName)) {
      return { ...base, taskInput: tryParseTaskToolInput(input) }
    }
    if (isAskUserQuestionToolName(toolName)) {
      return { ...base, askInput: tryParseAskUserQuestionToolInput(input) }
    }
    if (isWriteToolName(toolName)) {
      return { ...base, writeInput: tryParseWriteToolInput(input) }
    }
    if (isReadToolName(toolName)) {
      return { ...base, readInput: tryParseReadToolInput(input) }
    }
    if (isEditToolName(toolName)) {
      return { ...base, editInput: tryParseEditToolInput(input) }
    }
    if (isTodoWriteToolName(toolName)) {
      return { ...base, todoWriteInput: tryParseTodoWriteToolInput(input) }
    }
    if (isBashToolName(toolName)) {
      return { ...base, bashInput: tryParseBashToolInput(input) }
    }
    if (isGlobToolName(toolName)) {
      return { ...base, globInput: tryParseGlobToolInput(input) }
    }
    if (isGrepToolName(toolName)) {
      return { ...base, grepInput: tryParseGrepToolInput(input) }
    }
    if (isEnterPlanModeToolName(toolName)) {
      return { ...base, enterPlanModeInput: tryParseEnterPlanModeToolInput(input) }
    }
    if (isExitPlanModeToolName(toolName)) {
      return { ...base, exitPlanModeInput: tryParseExitPlanModeToolInput(input) }
    }

    return base
  }, [input, toolName])
}
