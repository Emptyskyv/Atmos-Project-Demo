export { createOpenAiCompatibleRuntime as createOpenAiCompatRuntime } from '@/src/backend/agent/runtime-openai-compatible'

export function isCompatSerializedState(serializedState: unknown): serializedState is string {
  if (typeof serializedState !== 'string' || serializedState.trim().length === 0) {
    return false
  }

  try {
    const parsed = JSON.parse(serializedState) as { version?: unknown }
    return parsed.version === 'openai-chat-v1'
  } catch {
    return false
  }
}
