import type { TaskToolInput } from '@/components/project-workspace/tool-inputs/taskType'
import type { TodoWriteToolInput, TodoWriteToolTodo, TodoWriteStatus } from '@/components/project-workspace/tool-inputs/todoType'
import type { AskUserQuestionToolInput, AskUserQuestionToolQuestion, AskUserQuestionToolOption } from '@/components/project-workspace/tool-inputs/askType'
import type { EnterPlanModeToolInput, ExitPlanModeToolInput } from '@/components/project-workspace/tool-inputs/planModeType'

export type ReadToolInput = {
  filePath: string
  content?: string
  offset?: number
  limit?: number
}

export type BashToolInput = {
  command: string
  description?: string
}

export type GlobToolInput = {
  pattern: string
  path?: string
}

export type GrepToolInput = {
  pattern: string
  path?: string
  outputMode?: string
  glob?: string
  type?: string
}

export type WriteToolInput = {
  filePath: string
  content: string
}

export type StructuredPatchHunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export type EditToolInput = {
  filePath: string
  oldString: string
  newString: string
  replaceAll: boolean
  originalFile?: string
  structuredPatch?: StructuredPatchHunk[]
}

function normalizeToolNameKey(toolName: string): string {
  return (toolName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function getBaseToolName(toolName: string): string {
  // 提取工具名称的基础部分,例如:
  // "Read" -> "read"
  // "claude.Read" -> "read"
  // "server.Write" -> "write"
  // "mcp.Claude.Write" -> "write"
  const normalized = normalizeToolNameKey(toolName)

  // 移除常见的前缀
  const prefixes = ['mcp', 'claude', 'codex', 'server', 'agent']
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length)
    }
  }

  return normalized
}

export function isWriteToolName(toolName: string): boolean {
  const baseName = getBaseToolName(toolName)
  return baseName === 'write' || baseName.endsWith('write')
}

export function isEditToolName(toolName: string): boolean {
  const baseName = getBaseToolName(toolName)
  return baseName === 'edit' || baseName.endsWith('edit')
}

export function isAskUserQuestionToolName(toolName: string): boolean {
  const baseName = getBaseToolName(toolName)
  return baseName === 'askuserquestion' || baseName.endsWith('askuserquestion')
}

export function isReadToolName(toolName: string): boolean {
  const baseName = getBaseToolName(toolName)
  return baseName === 'read' || baseName.endsWith('read')
}

export function isBashToolName(toolName: string): boolean {
  const baseName = getBaseToolName(toolName)
  return baseName === 'bash' || baseName.endsWith('bash')
}

export function isGlobToolName(toolName: string): boolean {
  const baseName = getBaseToolName(toolName)
  return baseName === 'glob' || baseName.endsWith('glob')
}

export function isGrepToolName(toolName: string): boolean {
  const baseName = getBaseToolName(toolName)
  return baseName === 'grep' || baseName.endsWith('grep')
}

export function isTodoWriteToolName(toolName: string): boolean {
  const baseName = getBaseToolName(toolName)
  return baseName === 'todowrite' || baseName.endsWith('todowrite')
}

export function isTaskToolName(toolName: string): boolean {
  const baseName = getBaseToolName(toolName)
  return baseName === 'task' || baseName.endsWith('task')
}

export function isEnterPlanModeToolName(toolName: string): boolean {
  const baseName = getBaseToolName(toolName)
  return baseName === 'enterplanmode' || baseName.endsWith('enterplanmode')
}

export function isExitPlanModeToolName(toolName: string): boolean {
  const baseName = getBaseToolName(toolName)
  return baseName === 'exitplanmode' || baseName.endsWith('exitplanmode')
}

function unwrapToolArgsRecord(obj: Record<string, unknown>): Record<string, unknown> {
  const tryReadRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value) return null
    if (typeof value === 'string') return tryParseJsonRecord(value)
    if (typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  }

  return (
    tryReadRecord(obj.args) ??
    tryReadRecord(obj.arguments) ??
    tryReadRecord(obj.toolArgs) ??
    tryReadRecord(obj.tool_args) ??
    tryReadRecord(obj.input) ??
    tryReadRecord(obj.parameters) ??
    tryReadRecord(obj.params) ??
    obj
  )
}

function tryParseJsonRecord(value: string): Record<string, unknown> | null {
  const raw = (value ?? '').trim()
  if (!raw) return null

  const start = raw.indexOf('{')
  if (start < 0) return null
  const end = raw.lastIndexOf('}')
  const wideCandidate = end > start ? raw.slice(start, end + 1) : raw.slice(start)

  try {
    const parsed = JSON.parse(wideCandidate) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function readFirstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string') return value
  }
  return null
}

function readFirstNonEmptyString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
  }
  return null
}

function readFirstNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key]
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : null
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function tryParseWriteToolInput(input: string): WriteToolInput | null {
  const obj = tryParseJsonRecord(input)
  if (!obj) return null
  const args = unwrapToolArgsRecord(obj)

  const filePath =
    readFirstNonEmptyString(args, ['file_path', 'filePath', 'path']) ??
    readFirstNonEmptyString(args, ['file', 'target', 'targetPath'])

  const content = readFirstString(args, ['content', 'text'])

  if (!filePath) return null
  if (content == null) return null
  return { filePath, content }
}

export function tryParseEditToolInput(input: string): EditToolInput | null {
  const obj = tryParseJsonRecord(input)
  if (!obj) return null
  const args = unwrapToolArgsRecord(obj)

  const filePath =
    readFirstNonEmptyString(args, ['file_path', 'filePath', 'path']) ??
    readFirstNonEmptyString(args, ['file', 'target', 'targetPath'])

  const oldString = readFirstString(args, ['old_string', 'oldString'])
  const newString = readFirstString(args, ['new_string', 'newString'])
  const replaceAll = args.replace_all === true || args.replaceAll === true

  // 解析 originalFile
  const originalFile = readFirstString(args, ['original_file', 'originalFile'])

  // 解析 structuredPatch
  let structuredPatch: StructuredPatchHunk[] | undefined
  const patchValue = args.structured_patch ?? args.structuredPatch
  if (Array.isArray(patchValue)) {
    const hunks: StructuredPatchHunk[] = []
    for (const hunk of patchValue) {
      if (!hunk || typeof hunk !== 'object' || Array.isArray(hunk)) continue
      const h = hunk as Record<string, unknown>
      const oldStart = typeof h.oldStart === 'number' ? h.oldStart : null
      const oldLines = typeof h.oldLines === 'number' ? h.oldLines : null
      const newStart = typeof h.newStart === 'number' ? h.newStart : null
      const newLines = typeof h.newLines === 'number' ? h.newLines : null
      const lines = Array.isArray(h.lines) ? h.lines.filter((l): l is string => typeof l === 'string') : null
      if (oldStart != null && oldLines != null && newStart != null && newLines != null && lines) {
        hunks.push({ oldStart, oldLines, newStart, newLines, lines })
      }
    }
    if (hunks.length > 0) {
      structuredPatch = hunks
    }
  }

  if (!filePath) return null
  if (oldString == null || newString == null) return null
  return {
    filePath,
    oldString,
    newString,
    replaceAll,
    originalFile: originalFile ?? undefined,
    structuredPatch,
  }
}

export function tryParseReadToolInput(input: string): ReadToolInput | null {
  const obj = tryParseJsonRecord(input)
  if (!obj) return null
  const args = unwrapToolArgsRecord(obj)

  const fileValue = args.file
  let filePathFromFile: string | null = null
  let contentFromFile: string | null = null
  let offsetFromFile: number | null = null
  let limitFromFile: number | null = null
  if (fileValue && typeof fileValue === 'object' && !Array.isArray(fileValue)) {
    const fileObj = fileValue as Record<string, unknown>
    filePathFromFile =
      readFirstNonEmptyString(fileObj, ['file_path', 'filePath', 'path']) ??
      readFirstNonEmptyString(fileObj, ['file', 'target', 'targetPath'])
    contentFromFile = readFirstString(fileObj, ['content', 'text'])
    offsetFromFile = readFirstNumber(fileObj, ['offset'])
    limitFromFile = readFirstNumber(fileObj, ['limit'])
  }

  const filePath =
    filePathFromFile ??
    readFirstNonEmptyString(args, ['file_path', 'filePath', 'path']) ??
    readFirstNonEmptyString(args, ['file', 'target', 'targetPath'])

  if (!filePath) return null

  const content = contentFromFile ?? readFirstString(args, ['content', 'text'])
  const offset = offsetFromFile ?? readFirstNumber(args, ['offset'])
  const limit = limitFromFile ?? readFirstNumber(args, ['limit'])
  return {
    filePath,
    content: content ?? undefined,
    offset: offset ?? undefined,
    limit: limit ?? undefined,
  }
}

export function tryParseBashToolInput(input: string): BashToolInput | null {
  const obj = tryParseJsonRecord(input)
  if (!obj) return null
  const args = unwrapToolArgsRecord(obj)

  const command = readFirstString(args, ['command', 'cmd'])
  if (!command) return null

  const description = readFirstString(args, ['description', 'desc'])
  return {
    command,
    description: description ?? undefined,
  }
}

export function tryParseGlobToolInput(input: string): GlobToolInput | null {
  const obj = tryParseJsonRecord(input)
  if (!obj) return null
  const args = unwrapToolArgsRecord(obj)

  const pattern = readFirstString(args, ['pattern'])
  if (!pattern) return null

  const path = readFirstString(args, ['path', 'directory', 'dir'])
  return {
    pattern,
    path: path ?? undefined,
  }
}

export function tryParseGrepToolInput(input: string): GrepToolInput | null {
  const obj = tryParseJsonRecord(input)
  if (!obj) return null
  const args = unwrapToolArgsRecord(obj)

  const pattern = readFirstString(args, ['pattern'])
  if (!pattern) return null

  const path = readFirstString(args, ['path', 'directory', 'dir'])
  const outputMode = readFirstString(args, ['output_mode', 'outputMode', 'mode'])
  const glob = readFirstString(args, ['glob'])
  const type = readFirstString(args, ['type'])

  return {
    pattern,
    path: path ?? undefined,
    outputMode: outputMode ?? undefined,
    glob: glob ?? undefined,
    type: type ?? undefined,
  }
}

function normalizeTodoWriteStatus(value: unknown): TodoWriteStatus {
  const raw = typeof value === 'string' ? value.trim() : ''
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  if (key === 'completed' || key === 'done') return 'completed'
  if (key === 'in_progress' || key === 'inprogress' || key === 'running') return 'in_progress'
  return 'pending'
}

export function tryParseTodoWriteToolInput(input: string): TodoWriteToolInput | null {
  const obj = tryParseJsonRecord(input)
  if (!obj) return null
  const args = unwrapToolArgsRecord(obj)

  const todosValue = args.todos
  if (!Array.isArray(todosValue)) return null

  const todos: TodoWriteToolTodo[] = []
  for (const todoValue of todosValue) {
    if (!todoValue || typeof todoValue !== 'object' || Array.isArray(todoValue)) continue
    const todoObj = todoValue as Record<string, unknown>
    const content = typeof todoObj.content === 'string' ? todoObj.content.trim() : ''
    const activeForm = typeof todoObj.activeForm === 'string' ? todoObj.activeForm.trim() : ''
    const status = normalizeTodoWriteStatus(todoObj.status)

    const normalizedContent = content || activeForm
    if (!normalizedContent) continue

    todos.push({
      content: normalizedContent,
      activeForm: activeForm || normalizedContent,
      status,
    })
  }

  return { todos }
}

export function tryParseTaskToolInput(input: string): TaskToolInput | null {
  const obj = tryParseJsonRecord(input)
  if (!obj) return null
  const args = unwrapToolArgsRecord(obj)

  const subagentType =
    readFirstNonEmptyString(args, ['subagent_type', 'subagentType', 'subagent', 'agentType']) ?? ''
  const description = readFirstNonEmptyString(args, ['description', 'desc']) ?? ''
  const prompt = readFirstString(args, ['prompt']) ?? ''

  if (!subagentType && !description && !prompt.trim()) return null
  return { subagentType, description, prompt }
}

export function tryParseAskUserQuestionToolInput(input: string): AskUserQuestionToolInput | null {
  const obj = tryParseJsonRecord(input)
  if (!obj) return null
  const args = unwrapToolArgsRecord(obj)

  const questionsValue = args.questions
  if (!Array.isArray(questionsValue) || questionsValue.length === 0) return null

  const questions: AskUserQuestionToolQuestion[] = []
  for (const questionValue of questionsValue) {
    if (!questionValue || typeof questionValue !== 'object') continue
    const questionObj = questionValue as Record<string, unknown>

    const questionText = typeof questionObj.question === 'string' ? questionObj.question.trim() : ''
    if (!questionText) continue

    const header = typeof questionObj.header === 'string' ? questionObj.header.trim() : ''
    const multiSelect = questionObj.multiSelect === true || questionObj.multi_select === true

    const optionsValue = questionObj.options
    if (!Array.isArray(optionsValue) || optionsValue.length < 2) continue

    const options: AskUserQuestionToolOption[] = []
    for (const optionValue of optionsValue) {
      if (!optionValue || typeof optionValue !== 'object') continue
      const optionObj = optionValue as Record<string, unknown>
      const label = typeof optionObj.label === 'string' ? optionObj.label.trim() : ''
      if (!label) continue
      const description = typeof optionObj.description === 'string' ? optionObj.description.trim() : ''
      const value = typeof optionObj.value === 'string' ? optionObj.value.trim() : undefined
      options.push(value ? { label, description, value } : { label, description })
    }

    if (options.length < 2) continue
    questions.push({ header, question: questionText, multiSelect, options })
  }

  if (questions.length === 0) return null

  let answers: Record<string, string> | undefined
  const answersValue = args.answers
  if (answersValue && typeof answersValue === 'object' && !Array.isArray(answersValue)) {
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(answersValue as Record<string, unknown>)) {
      if (typeof value === 'string') {
        next[key] = value
      }
    }
    if (Object.keys(next).length > 0) {
      answers = next
    }
  }

  return answers ? { questions, answers } : { questions }
}

export function tryParseEnterPlanModeToolInput(input: string): EnterPlanModeToolInput | null {
  const obj = tryParseJsonRecord(input)
  if (!obj) return null
  const args = unwrapToolArgsRecord(obj)

  const message = readFirstString(args, ['message', 'msg']) ?? ''
  return { message }
}

export function tryParseExitPlanModeToolInput(input: string): ExitPlanModeToolInput | null {
  const obj = tryParseJsonRecord(input)
  if (!obj) return null
  const args = unwrapToolArgsRecord(obj)

  const plan = readFirstString(args, ['plan'])
  const isAgent = args.isAgent === true || args.is_agent === true
  const filePath = readFirstString(args, ['filePath', 'file_path', 'path']) ?? ''

  return { plan, isAgent, filePath }
}
