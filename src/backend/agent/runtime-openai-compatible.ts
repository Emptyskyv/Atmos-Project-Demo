import { SYSTEM_PROMPT } from '@/src/backend/agent/prompts/system'
import { formatAgentRuntimeError } from '@/src/backend/agent/runtime-errors'
import {
  APPROVAL_TOOL_NAMES,
  TOOL_DESCRIPTIONS,
  TOOL_INPUT_SCHEMAS,
  type AgentRuntime,
  type RuntimeStreamInput,
} from '@/src/backend/agent/runtime-shared'
import {
  buildOpenAICompatibleConfig,
  type OpenAICompatibleConfig,
} from '@/src/backend/agent/openai-endpoint'
import { serverEnv } from '@/src/backend/platform/env'

type CompatibleRuntimeOptions = {
  config?: OpenAICompatibleConfig
  fetchImpl?: typeof fetch
}

type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant'
      content: string | null
      reasoning_content?: string | null
      tool_calls?: ChatToolCall[]
    }
  | { role: 'tool'; tool_call_id: string; content: string }

type ChatToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

type SerializedChatState = {
  version: 'openai-chat-v1'
  messages: ChatMessage[]
}

type ChatChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
}

type ToolDefinition = {
  type: 'function'
  function: {
    name: (typeof APPROVAL_TOOL_NAMES)[number]
    description: string
    parameters: Record<string, unknown>
  }
}

type GatewayErrorBody = {
  error?: {
    message?: string
    code?: string
    type?: string
  }
}

const COMPAT_GATEWAY_MAX_ATTEMPTS = 3
const RETRYABLE_GATEWAY_ERROR_CODES = new Set(['Arrearage'])

const COMPAT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: TOOL_DESCRIPTIONS.bash,
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', minLength: 1 },
          cwd: { type: 'string', minLength: 1 },
        },
        required: ['command'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read',
      description: TOOL_DESCRIPTIONS.read,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', minLength: 1 },
          startLine: { type: 'integer', minimum: 1 },
          endLine: { type: 'integer', minimum: 1 },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write',
      description: TOOL_DESCRIPTIONS.write,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', minLength: 1 },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: TOOL_DESCRIPTIONS.edit,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', minLength: 1 },
          oldString: { type: 'string' },
          newString: { type: 'string' },
          replaceAll: { type: 'boolean' },
        },
        required: ['path', 'oldString', 'newString'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list',
      description: TOOL_DESCRIPTIONS.list,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: TOOL_DESCRIPTIONS.glob,
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', minLength: 1 },
          cwd: { type: 'string', minLength: 1 },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: TOOL_DESCRIPTIONS.grep,
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', minLength: 1 },
          include: { type: 'string', minLength: 1 },
          cwd: { type: 'string', minLength: 1 },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'applyPatch',
      description: TOOL_DESCRIPTIONS.applyPatch,
      parameters: {
        type: 'object',
        properties: {
          patch: { type: 'string', minLength: 1 },
        },
        required: ['patch'],
        additionalProperties: false,
      },
    },
  },
]

function joinUrl(baseURL: string, path: string, defaultQuery?: Record<string, string>) {
  const normalizedPath = path.replace(/^\/+/, '')
  const url = new URL(normalizedPath, baseURL.endsWith('/') ? baseURL : `${baseURL}/`)

  if (defaultQuery) {
    for (const [key, value] of Object.entries(defaultQuery)) {
      url.searchParams.set(key, value)
    }
  }

  return url.toString()
}

function serializeToolOutput(output: unknown) {
  if (typeof output === 'string') {
    return output
  }

  return JSON.stringify(output ?? {})
}

function parseSerializedState(serializedState: unknown) {
  if (typeof serializedState !== 'string' || serializedState.length === 0) {
    return null
  }

  const parsed = JSON.parse(serializedState) as SerializedChatState

  if (parsed.version !== 'openai-chat-v1' || !Array.isArray(parsed.messages)) {
    throw new Error('Unsupported compat runtime state payload')
  }

  return parsed
}

async function* parseSseChunks(response: Response): AsyncGenerator<ChatChunk, void, void> {
  if (!response.body) {
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    if (!value) {
      continue
    }

    buffer += decoder.decode(value, { stream: true })

    while (true) {
      const boundaryIndex = buffer.indexOf('\n\n')

      if (boundaryIndex === -1) {
        break
      }

      const rawEvent = buffer.slice(0, boundaryIndex)
      buffer = buffer.slice(boundaryIndex + 2)

      const normalizedEvent = rawEvent.replace(/\r/g, '')
      const dataLines = normalizedEvent
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))

      if (dataLines.length === 0) {
        continue
      }

      const payload = dataLines.join('\n').trim()

      if (!payload || payload === '[DONE]') {
        continue
      }

      yield JSON.parse(payload) as ChatChunk
    }
  }

  buffer += decoder.decode()
}

async function requestChatCompletion(
  config: OpenAICompatibleConfig,
  fetchImpl: typeof fetch,
  model: string,
  messages: ChatMessage[],
) {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= COMPAT_GATEWAY_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchImpl(joinUrl(config.baseURL, '/chat/completions', config.defaultQuery), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
          ...config.headers,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: 0,
          parallel_tool_calls: false,
          tool_choice: 'auto',
          tools: COMPAT_TOOLS,
        }),
      })

      if (response.ok) {
        return response
      }

      const text = await response.text()
      let parsed: GatewayErrorBody | null = null
      let message = text || `OpenAI-compatible request failed with ${response.status}`

      try {
        parsed = JSON.parse(text) as GatewayErrorBody
        message = parsed.error?.message ?? message
      } catch {
        message = text || message
      }

      const gatewayCode = parsed?.error?.code ?? parsed?.error?.type
      const shouldRetry =
        attempt < COMPAT_GATEWAY_MAX_ATTEMPTS &&
        (response.status >= 500 ||
          (typeof gatewayCode === 'string' && RETRYABLE_GATEWAY_ERROR_CODES.has(gatewayCode)))

      if (shouldRetry) {
        lastError = new Error(message)
        continue
      }

      throw new Error(message)
    } catch (error) {
      if (attempt >= COMPAT_GATEWAY_MAX_ATTEMPTS) {
        throw error
      }

      lastError = error instanceof Error ? error : new Error('OpenAI-compatible request failed')
    }
  }

  throw lastError ?? new Error('OpenAI-compatible request failed')
}

function buildFreshMessages(userMessage: string) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ] satisfies ChatMessage[]
}

async function buildResumeMessages(input: RuntimeStreamInput) {
  const serializedState = parseSerializedState(input.run.serializedState)

  if (!serializedState) {
    throw new Error('Missing compat runtime state for resumed run')
  }

  const toolCallId = input.run.waitingToolCallId

  if (!toolCallId) {
    return serializedState.messages
  }

  const toolCall = await input.repository.getToolCallByCallId(toolCallId)

  if (!toolCall || toolCall.clientSequence === null) {
    throw new Error('Missing stored tool result for resumed compat run')
  }

  return [
    ...serializedState.messages,
    {
      role: 'tool',
      tool_call_id: toolCall.toolCallId,
      content: serializeToolOutput(toolCall.output),
    },
  ] satisfies ChatMessage[]
}

function validateToolCall(runId: string, toolCall: ChatToolCall) {
  if (!APPROVAL_TOOL_NAMES.includes(toolCall.function.name as (typeof APPROVAL_TOOL_NAMES)[number])) {
    throw new Error(`Unsupported tool ${toolCall.function.name}`)
  }

  const toolName = toolCall.function.name as (typeof APPROVAL_TOOL_NAMES)[number]
  const parsedArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
  const validation = TOOL_INPUT_SCHEMAS[toolName].safeParse(parsedArgs)

  if (!validation.success) {
    throw new Error(`Invalid arguments for tool ${toolName}`)
  }

  return {
    toolCallId: toolCall.id,
    runId,
    name: toolName,
    input: validation.data,
  }
}

export function createOpenAiCompatibleRuntime(options: CompatibleRuntimeOptions = {}): AgentRuntime {
  const config = options.config ?? buildOpenAICompatibleConfig(serverEnv)
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    async *stream(input) {
      const messageId = `msg_assistant_${input.run.id}`
      let assistantText = ''
      let reasoningText = ''
      const toolCalls = new Map<number, ChatToolCall>()
      let finishReason: string | null = null

      try {
        const messages =
          typeof input.run.serializedState === 'string' && input.run.serializedState.length > 0
            ? await buildResumeMessages(input)
            : buildFreshMessages(input.userMessage ?? '')

        const response = await requestChatCompletion(config, fetchImpl, input.run.model, messages)

        for await (const chunk of parseSseChunks(response)) {
          const choice = chunk.choices?.[0]

          if (!choice) {
            continue
          }

          finishReason = choice.finish_reason ?? finishReason

          const contentDelta = choice.delta?.content ?? ''
          const reasoningDelta = choice.delta?.reasoning_content ?? ''

          if (typeof contentDelta === 'string' && contentDelta.length > 0) {
            assistantText += contentDelta
            yield {
              type: 'assistant_text_delta',
              messageId,
              delta: contentDelta,
            }
          }

          if (typeof reasoningDelta === 'string' && reasoningDelta.length > 0) {
            reasoningText += reasoningDelta
          }

          for (const partialToolCall of choice.delta?.tool_calls ?? []) {
            const index = partialToolCall.index ?? 0
            const existing = toolCalls.get(index) ?? {
              id: partialToolCall.id ?? `call_${index}`,
              type: 'function',
              function: {
                name: '',
                arguments: '',
              },
            }

            toolCalls.set(index, {
              id: partialToolCall.id ?? existing.id,
              type: 'function',
              function: {
                name: partialToolCall.function?.name ?? existing.function.name,
                arguments: `${existing.function.arguments}${partialToolCall.function?.arguments ?? ''}`,
              },
            })
          }
        }

        if (toolCalls.size > 0 || finishReason === 'tool_calls') {
          const nextToolCall = [...toolCalls.entries()]
            .sort((left, right) => left[0] - right[0])
            .map(([, value]) => value)[0]

          if (!nextToolCall) {
            throw new Error('Missing tool call payload from compat runtime response')
          }

          yield {
            type: 'tool_request',
            toolCall: validateToolCall(input.run.id, nextToolCall),
            serializedState: JSON.stringify({
              version: 'openai-chat-v1',
              messages: [
                ...messages,
                {
                  role: 'assistant',
                  content: assistantText.length > 0 ? assistantText : null,
                  reasoning_content: reasoningText.length > 0 ? reasoningText : null,
                  tool_calls: [nextToolCall],
                },
              ],
            } satisfies SerializedChatState),
          }
          return
        }

        if (assistantText.length > 0) {
          yield {
            type: 'assistant_text_completed',
            messageId,
            text: assistantText,
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
