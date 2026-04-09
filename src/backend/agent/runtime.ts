import { resolveOpenAIRuntimeMode } from '@/src/backend/agent/openai-endpoint'
import { createAgentsSdkRuntime } from '@/src/backend/agent/agents-runtime'
import { createOpenAiCompatibleRuntime } from '@/src/backend/agent/runtime-openai-compatible'
import { isCompatSerializedState } from '@/src/backend/agent/openai-compat-runtime'
import type { RunRecord } from '@/src/backend/data/types'
import { serverEnv } from '@/src/backend/platform/env'
import type { AgentRuntime } from '@/src/backend/agent/runtime-shared'

export {
  APPROVAL_TOOL_NAMES,
  TOOL_INPUT_SCHEMAS,
  type RuntimeStreamEvent,
  type RuntimeStreamInput,
  type AgentRuntime,
} from '@/src/backend/agent/runtime-shared'

export function resolveOpenAiRuntimeMode(
  env: Pick<typeof serverEnv, 'OPENAI_RUNTIME' | 'OPENAI_BASE_URL' | 'OPENAI_RESPONSES_URL'>,
  run?: Pick<RunRecord, 'serializedState'>,
) {
  if (typeof run?.serializedState === 'string' && run.serializedState.length > 0) {
    return isCompatSerializedState(run.serializedState) ? 'compat' : 'agents'
  }

  return resolveOpenAIRuntimeMode(env)
}

export function createOpenAiRuntime(): AgentRuntime {
  let agentsRuntime: AgentRuntime | undefined
  let compatRuntime: AgentRuntime | undefined

  return {
    async *stream(input) {
      const runtimeMode = resolveOpenAiRuntimeMode(serverEnv, input.run)
      const runtime =
        runtimeMode === 'compat'
          ? (compatRuntime ??= createOpenAiCompatibleRuntime())
          : (agentsRuntime ??= createAgentsSdkRuntime())

      yield* runtime.stream(input)
    },
  }
}
