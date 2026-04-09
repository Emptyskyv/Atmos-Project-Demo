import type { AgentRuntime } from '@/src/backend/agent/runtime'

export function startRun(runtime: AgentRuntime, input: Parameters<AgentRuntime['stream']>[0]) {
  return runtime.stream(input)
}
