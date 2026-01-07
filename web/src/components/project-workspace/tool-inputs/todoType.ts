export type TodoWriteStatus = 'pending' | 'in_progress' | 'completed'

export type TodoWriteToolTodo = {
  content: string
  activeForm: string
  status: TodoWriteStatus
}

export type TodoWriteToolInput = {
  todos: TodoWriteToolTodo[]
}
