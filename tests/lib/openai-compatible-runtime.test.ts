// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { createOpenAiCompatibleRuntime } from '@/src/backend/agent/runtime-openai-compatible'
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

describe('createOpenAiCompatibleRuntime', () => {
  it('streams assistant text from chat completions chunks', async () => {
    const repository = createMemoryRepository()
    const run = await repository.createRun({
      projectId: 'proj_1',
      userId: 'usr_1',
      model: 'gpt-5.2',
      status: 'running',
    })

    const runtime = createOpenAiCompatibleRuntime({
      config: {
        apiKey: 'sk-test',
        baseURL: 'https://gateway.example.com/v1',
      },
      fetchImpl: vi.fn(async () =>
        createSseResponse([
          {
            id: 'chatcmpl_1',
            choices: [{ index: 0, delta: { content: 'Hello ' }, finish_reason: null }],
          },
          {
            id: 'chatcmpl_1',
            choices: [{ index: 0, delta: { content: 'world' }, finish_reason: null }],
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
      userMessage: 'Say hello',
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      {
        type: 'assistant_text_delta',
        messageId: `msg_assistant_${run.id}`,
        delta: 'Hello ',
      },
      {
        type: 'assistant_text_delta',
        messageId: `msg_assistant_${run.id}`,
        delta: 'world',
      },
      {
        type: 'assistant_text_completed',
        messageId: `msg_assistant_${run.id}`,
        text: 'Hello world',
      },
      {
        type: 'run_completed',
      },
    ])
  })

  it('serializes a pending tool call from chat completions chunks', async () => {
    const repository = createMemoryRepository()
    const run = await repository.createRun({
      projectId: 'proj_1',
      userId: 'usr_1',
      model: 'gpt-5.2',
      status: 'running',
    })

    const runtime = createOpenAiCompatibleRuntime({
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
                        arguments: '{"path":"app/page.tsx"',
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
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: {
                        arguments: ',"content":"hello"}',
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

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'tool_request',
      toolCall: {
        toolCallId: 'call_123',
        runId: run.id,
        name: 'write',
        input: {
          path: 'app/page.tsx',
          content: 'hello',
        },
      },
    })
    expect(events[0]).toHaveProperty('serializedState')
  })

  it('resumes a serialized chat state with the persisted tool output', async () => {
    const repository = createMemoryRepository()
    const run = await repository.createRun({
      projectId: 'proj_1',
      userId: 'usr_1',
      model: 'gpt-5.2',
      status: 'running',
      waitingToolCallId: 'call_123',
      serializedState: JSON.stringify({
        version: 'openai-chat-v1',
        messages: [
          {
            role: 'system',
            content: 'system prompt',
          },
          {
            role: 'user',
            content: 'Create the homepage',
          },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'write',
                  arguments: '{"path":"app/page.tsx","content":"hello"}',
                },
              },
            ],
          },
        ],
      }),
    })

    await repository.createToolCall({
      runId: run.id,
      projectId: run.projectId,
      userId: run.userId,
      toolCallId: 'call_123',
      name: 'write',
      input: {
        path: 'app/page.tsx',
        content: 'hello',
      },
      status: 'completed_server',
    })
    await repository.updateToolCall('call_123', {
      output: { path: 'app/page.tsx', bytes: 5 },
      clientSequence: 1,
    })

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.messages.at(-1)).toEqual({
        role: 'tool',
        tool_call_id: 'call_123',
        content: '{"path":"app/page.tsx","bytes":5}',
      })

      return createSseResponse([
        {
          id: 'chatcmpl_2',
          choices: [{ index: 0, delta: { content: 'Done.' }, finish_reason: null }],
        },
        {
          id: 'chatcmpl_2',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        },
        '[DONE]',
      ])
    })

    const runtime = createOpenAiCompatibleRuntime({
      config: {
        apiKey: 'sk-test',
        baseURL: 'https://gateway.example.com/v1',
      },
      fetchImpl: fetchImpl as typeof fetch,
    })

    const events = []
    for await (const event of runtime.stream({
      repository,
      run,
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      {
        type: 'assistant_text_delta',
        messageId: `msg_assistant_${run.id}`,
        delta: 'Done.',
      },
      {
        type: 'assistant_text_completed',
        messageId: `msg_assistant_${run.id}`,
        text: 'Done.',
      },
      {
        type: 'run_completed',
      },
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries transient arrearage gateway errors before failing the run', async () => {
    const repository = createMemoryRepository()
    const run = await repository.createRun({
      projectId: 'proj_1',
      userId: 'usr_1',
      model: 'gpt-5.2',
      status: 'running',
    })

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'Access denied, please make sure your account is in good standing.',
              type: 'Arrearage',
              code: 'Arrearage',
            },
          }),
          {
            status: 400,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        createSseResponse([
          {
            id: 'chatcmpl_retry',
            choices: [{ index: 0, delta: { content: 'Recovered' }, finish_reason: null }],
          },
          {
            id: 'chatcmpl_retry',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          },
          '[DONE]',
        ]),
      )

    const runtime = createOpenAiCompatibleRuntime({
      config: {
        apiKey: 'sk-test',
        baseURL: 'https://gateway.example.com/v1',
      },
      fetchImpl: fetchImpl as typeof fetch,
    })

    const events = []
    for await (const event of runtime.stream({
      repository,
      run,
      userMessage: 'Say recovered',
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      {
        type: 'assistant_text_delta',
        messageId: `msg_assistant_${run.id}`,
        delta: 'Recovered',
      },
      {
        type: 'assistant_text_completed',
        messageId: `msg_assistant_${run.id}`,
        text: 'Recovered',
      },
      {
        type: 'run_completed',
      },
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
