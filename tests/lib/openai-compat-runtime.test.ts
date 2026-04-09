// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { createOpenAiCompatRuntime, isCompatSerializedState } from '@/src/backend/agent/openai-compat-runtime'
import { createMemoryRepository } from '@/src/backend/data/memory'

function createSseResponse(chunks: Array<Record<string, unknown> | '[DONE]'>) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        const payload = chunk === '[DONE]' ? '[DONE]' : JSON.stringify(chunk)
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
    },
  })
}

describe('openai compat runtime facade', () => {
  it('streams assistant text deltas from the compatible runtime', async () => {
    const repository = createMemoryRepository()
    const run = await repository.createRun({
      projectId: 'proj_1',
      userId: 'usr_1',
      model: 'gpt-5.2',
      status: 'running',
    })

    const runtime = createOpenAiCompatRuntime({
      config: {
        apiKey: 'sk-test',
        baseURL: 'https://gateway.example.com/v1',
      },
      fetchImpl: vi.fn(async () =>
        createSseResponse([
          {
            id: 'chatcmpl_1',
            choices: [{ index: 0, delta: { content: 'Done' }, finish_reason: null }],
          },
          {
            id: 'chatcmpl_1',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          },
          '[DONE]',
        ]),
      ) as typeof fetch,
    })

    const events = []
    for await (const event of runtime.stream({
      repository,
      run,
      userMessage: 'Say done',
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      {
        type: 'assistant_text_delta',
        messageId: `msg_assistant_${run.id}`,
        delta: 'Done',
      },
      {
        type: 'assistant_text_completed',
        messageId: `msg_assistant_${run.id}`,
        text: 'Done',
      },
      {
        type: 'run_completed',
      },
    ])
  })

  it('recognizes serialized compat runtime state', async () => {
    const repository = createMemoryRepository()
    const run = await repository.createRun({
      projectId: 'proj_1',
      userId: 'usr_1',
      model: 'gpt-5.2',
      status: 'running',
    })

    const runtime = createOpenAiCompatRuntime({
      config: {
        apiKey: 'sk-test',
        baseURL: 'https://gateway.example.com/v1',
      },
      fetchImpl: vi.fn(async () =>
        createSseResponse([
          {
            id: 'chatcmpl_1',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_123',
                      type: 'function',
                      function: {
                        name: 'write',
                        arguments: '{"path":"app/page.tsx","content":"hello"}',
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          {
            id: 'chatcmpl_1',
            choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
          },
          '[DONE]',
        ]),
      ) as typeof fetch,
    })

    const events = []
    for await (const event of runtime.stream({
      repository,
      run,
      userMessage: 'Create the homepage',
    })) {
      events.push(event)
    }

    if (events[0]?.type !== 'tool_request') {
      throw new Error('Expected tool_request event')
    }

    expect(isCompatSerializedState(events[0].serializedState)).toBe(true)
  })
})
