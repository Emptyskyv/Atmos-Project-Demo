import type { ToolCallRequest } from '@/src/shared/agent/tools/serializers'
import type { AppRepository, RunRecord } from '@/src/backend/data/types'
import {
  CORE_TOOL_DESCRIPTIONS,
  CORE_TOOL_INPUT_SCHEMAS,
  CORE_TOOL_NAMES,
} from '@/src/shared/agent/tool-contract'

export const TOOL_INPUT_SCHEMAS = CORE_TOOL_INPUT_SCHEMAS

export const APPROVAL_TOOL_NAMES = [...CORE_TOOL_NAMES] satisfies ToolCallRequest['name'][]

export const TOOL_DESCRIPTIONS = CORE_TOOL_DESCRIPTIONS

export type RuntimeStreamEvent =
  | { type: 'assistant_text_delta'; messageId: string; delta: string }
  | { type: 'assistant_text_completed'; messageId: string; text: string }
  | { type: 'tool_request'; toolCall: ToolCallRequest; serializedState: string }
  | { type: 'run_completed' }
  | { type: 'run_failed'; message: string }

export type RuntimeStreamInput = {
  repository: AppRepository
  run: RunRecord
  userMessage?: string
}

export interface AgentRuntime {
  stream(input: RuntimeStreamInput): AsyncGenerator<RuntimeStreamEvent, void, void>
}
