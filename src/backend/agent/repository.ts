export interface RunRecord {
  id: string
  projectId: string
  userId: string
  model: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'waiting_for_tool' | 'cancelled'
  waitingToolCallId: string | null
  startedAt: string | null
  finishedAt: string | null
  lastError: { code: string; message: string } | null
  createdAt: string
}
