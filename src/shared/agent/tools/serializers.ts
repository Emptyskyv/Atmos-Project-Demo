import type { ToolName } from '@/src/shared/agent/tools/definitions'

export interface ToolCallRequest {
  toolCallId: string
  runId: string
  name: ToolName
  input: Record<string, unknown>
}

export interface ToolResultPayload {
  toolCallId: string
  output: unknown
  isError?: boolean
  durationMs?: number
  filesChanged?: string[]
  updatedFiles?: Array<{ path: string; contents: string }>
  previewUrl?: string | null
  logs?: Array<{ ts: string; stream: 'stdout' | 'stderr' | 'info'; text: string }>
  clientSequence: number
}
