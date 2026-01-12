export type EnterPlanModeToolInput = {
  message: string
}

export type ExitPlanModeToolInput = {
  plan: string | null
  isAgent: boolean
  filePath: string
}
