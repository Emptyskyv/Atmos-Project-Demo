import type { ToolCallRequest } from '@/src/shared/agent/tools/serializers'

export function toTimelineSummary(toolCall: ToolCallRequest) {
  return `${toolCall.name} ${JSON.stringify(toolCall.input)}`
}
