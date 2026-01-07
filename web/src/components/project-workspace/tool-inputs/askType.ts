export type AskUserQuestionToolOption = {
  label: string
  description: string
  value?: string
}

export type AskUserQuestionToolQuestion = {
  header: string
  question: string
  multiSelect: boolean
  options: AskUserQuestionToolOption[]
}

export type AskUserQuestionToolInput = {
  questions: AskUserQuestionToolQuestion[]
  answers?: Record<string, string>
}
