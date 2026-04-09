import {
  Agent,
  OpenAIProvider,
  RunContext,
  Runner,
  RunState,
  tool,
  type ModelSettings,
} from '@openai/agents'
import { z } from 'zod'
import { buildOpenAIModelSettings, buildOpenAIProviderConfig } from '@/src/backend/agent/openai-endpoint'
import { SYSTEM_PROMPT } from '@/src/backend/agent/prompts/system'
import { formatAgentRuntimeError } from '@/src/backend/agent/runtime-errors'
import {
  APPROVAL_TOOL_NAMES,
  TOOL_DESCRIPTIONS,
  TOOL_INPUT_SCHEMAS,
  type AgentRuntime,
  type RuntimeStreamEvent,
} from '@/src/backend/agent/runtime-shared'
import { serverEnv } from '@/src/backend/platform/env'
import type { ToolCallRequest } from '@/src/shared/agent/tools/serializers'
import type { AppRepository } from '@/src/backend/data/types'

type RuntimeContext = {
  repository: AppRepository
}

type RawTextEvent = {
  type: 'raw_model_stream_event'
  data: {
    type: 'output_text_delta' | 'response_done' | 'response_started' | 'model'
    delta?: string
  }
}

function buildApprovalTool<TName extends (typeof APPROVAL_TOOL_NAMES)[number]>(
  name: TName,
  parameters: (typeof TOOL_INPUT_SCHEMAS)[TName],
) {
  return tool({
    name,
    description: TOOL_DESCRIPTIONS[name],
    parameters: parameters as z.ZodObject<z.ZodRawShape>,
    needsApproval: true,
    async execute(_input, runContext, details) {
      if (!runContext) {
        throw new Error('Missing repository context for tool result resolution')
      }

      const toolCallId = details?.toolCall?.callId

      if (!toolCallId) {
        throw new Error('Missing tool call id for tool result resolution')
      }

      const runtimeContext = runContext.context as RuntimeContext
      const storedToolCall = await runtimeContext.repository.getToolCallByCallId(toolCallId)

      if (!storedToolCall || storedToolCall.clientSequence === null) {
        throw new Error('Tool result not yet available')
      }

      return storedToolCall.output ?? {}
    },
  })
}

const APPROVAL_TOOLS = APPROVAL_TOOL_NAMES.map((name) => buildApprovalTool(name, TOOL_INPUT_SCHEMAS[name]))

function createAtomsAgent(model: string, modelSettings?: ModelSettings) {
  return new Agent<RuntimeContext>({
    name: 'Atoms',
    model,
    instructions: SYSTEM_PROMPT,
    modelSettings,
    tools: APPROVAL_TOOLS,
  })
}

function buildRunner() {
  return new Runner({
    modelProvider: new OpenAIProvider({
      ...buildOpenAIProviderConfig(serverEnv),
    }),
    tracingDisabled: true,
  })
}

function isRawTextEvent(event: unknown): event is RawTextEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    event.type === 'raw_model_stream_event' &&
    'data' in event &&
    typeof event.data === 'object' &&
    event.data !== null &&
    'type' in event.data
  )
}

export function createAgentsSdkRuntime(): AgentRuntime {
  const runner = buildRunner()
  const modelSettings = buildOpenAIModelSettings(serverEnv)

  return {
    async *stream({ repository, run: storedRun, userMessage }) {
      const agent = createAtomsAgent(storedRun.model, modelSettings)
      const runContext = new RunContext<RuntimeContext>({
        repository,
      })
      let assistantText = ''
      const messageId = `msg_assistant_${storedRun.id}`

      try {
        let agentInput: string | RunState<RuntimeContext, typeof agent>

        if (typeof storedRun.serializedState === 'string' && storedRun.serializedState.length > 0) {
          const runState = await RunState.fromStringWithContext(
            agent,
            storedRun.serializedState,
            runContext,
            {
              contextStrategy: 'replace',
            },
          )

          for (const interruption of runState.getInterruptions()) {
            const toolCallId =
              'callId' in interruption.rawItem ? interruption.rawItem.callId : undefined
            const storedToolCall = toolCallId
              ? await repository.getToolCallByCallId(toolCallId)
              : null

            if (storedToolCall?.clientSequence !== null) {
              runState.approve(interruption)
            }
          }

          agentInput = runState
        } else {
          agentInput = userMessage ?? ''
        }

        const streamedResult = await runner.run(agent, agentInput, {
          stream: true,
          context: runContext,
          maxTurns: serverEnv.RUN_MAX_STEPS,
        })

        for await (const event of streamedResult) {
          if (!isRawTextEvent(event) || event.data.type !== 'output_text_delta') {
            continue
          }

          const delta = typeof event.data.delta === 'string' ? event.data.delta : ''

          if (!delta) {
            continue
          }

          assistantText += delta
          yield {
            type: 'assistant_text_delta',
            messageId,
            delta,
          } satisfies RuntimeStreamEvent
        }

        await streamedResult.completed

        if (streamedResult.interruptions.length > 0) {
          const interruption = streamedResult.interruptions[0]
          const rawItem = interruption.rawItem

          if (rawItem.type !== 'function_call') {
            throw new Error(`Unsupported interruption item ${rawItem.type}`)
          }

          let input: Record<string, unknown> = {}

          try {
            input = JSON.parse(rawItem.arguments) as Record<string, unknown>
          } catch {
            input = {}
          }

          yield {
            type: 'tool_request',
            toolCall: {
              toolCallId: rawItem.callId,
              runId: storedRun.id,
              name: rawItem.name as ToolCallRequest['name'],
              input,
            },
            serializedState: streamedResult.state.toString(),
          }
          return
        }

        const finalText =
          typeof streamedResult.finalOutput === 'string' && streamedResult.finalOutput.length > 0
            ? streamedResult.finalOutput
            : assistantText

        if (finalText.length > 0) {
          yield {
            type: 'assistant_text_completed',
            messageId,
            text: finalText,
          }
        }

        yield {
          type: 'run_completed',
        }
      } catch (error) {
        yield {
          type: 'run_failed',
          message: formatAgentRuntimeError(error),
        }
      }
    },
  }
}
