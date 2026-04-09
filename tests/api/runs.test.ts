import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCaches } from '@/src/backend/platform/env'
import { buildApiApp } from '@/src/backend/api/app'
import { createTestRepository, registerAndGetSessionCookie } from '@/tests/api/helpers'

function restoreEnv(key: string, value: string | undefined) {
  if (typeof value === 'undefined') {
    delete process.env[key]
    return
  }

  process.env[key] = value
}

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

describe('runs routes', () => {
  const originalModel = process.env.OPENAI_MODEL
  const originalDatabaseUrl = process.env.DATABASE_URL
  const originalVercelToken = process.env.VERCEL_TOKEN
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY
  const originalOpenAiBaseUrl = process.env.OPENAI_BASE_URL
  const originalOpenAiResponsesUrl = process.env.OPENAI_RESPONSES_URL
  const originalOpenAiRuntime = process.env.OPENAI_RUNTIME
  const originalOpenAiRequestHeaders = process.env.OPENAI_REQUEST_HEADERS

  beforeEach(() => {
    restoreEnv(
      'DATABASE_URL',
      originalDatabaseUrl ?? 'postgresql://postgres:postgres@127.0.0.1:5432/atoms?schema=public',
    )
    restoreEnv('VERCEL_TOKEN', originalVercelToken ?? 'vercel-token')
    restoreEnv('OPENAI_API_KEY', originalOpenAiApiKey ?? 'sk-test')
    restoreEnv('OPENAI_MODEL', originalModel ?? 'gpt-5.2')
    restoreEnv('OPENAI_BASE_URL', originalOpenAiBaseUrl)
    restoreEnv('OPENAI_RESPONSES_URL', originalOpenAiResponsesUrl)
    restoreEnv('OPENAI_RUNTIME', originalOpenAiRuntime)
    restoreEnv('OPENAI_REQUEST_HEADERS', originalOpenAiRequestHeaders)
    resetEnvCaches()
  })

  afterEach(() => {
    restoreEnv('DATABASE_URL', originalDatabaseUrl)
    restoreEnv('VERCEL_TOKEN', originalVercelToken)
    restoreEnv('OPENAI_API_KEY', originalOpenAiApiKey)
    restoreEnv('OPENAI_MODEL', originalModel)
    restoreEnv('OPENAI_BASE_URL', originalOpenAiBaseUrl)
    restoreEnv('OPENAI_RESPONSES_URL', originalOpenAiResponsesUrl)
    restoreEnv('OPENAI_RUNTIME', originalOpenAiRuntime)
    restoreEnv('OPENAI_REQUEST_HEADERS', originalOpenAiRequestHeaders)
    vi.unstubAllGlobals()
    resetEnvCaches()
  })

  it('creates a queued run and streams a completed assistant message', async () => {
    const repository = createTestRepository()
    const runtime = {
      stream: vi.fn(async function* () {
        yield {
          type: 'assistant_text_delta',
          messageId: 'msg_assistant_1',
          delta: 'Working ',
        }
        yield {
          type: 'assistant_text_completed',
          messageId: 'msg_assistant_1',
          text: 'Working on your app now.',
        }
        yield {
          type: 'run_completed',
        }
      }),
    }
    const app = buildApiApp({
      repository,
      runtime,
    })
    const cookie = await registerAndGetSessionCookie(app)

    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'Run demo',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()

    const createRes = await app.request(`/projects/${projectBody.project.id}/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        userMessage: { text: 'Build a todo app' },
      }),
    })

    expect(createRes.status).toBe(201)

    const createBody = await createRes.json()
    expect(createBody.run.status).toBe('queued')
    expect(createBody.streamUrl).toMatch(/^\/api\/runs\//)

    const streamRes = await app.request(`/runs/${createBody.run.id}/stream`, {
      headers: {
        cookie,
      },
    })

    expect(streamRes.status).toBe(200)
    expect(streamRes.headers.get('content-type')).toContain('text/event-stream')

    const streamText = await streamRes.text()
    expect(streamText).toContain('event: run_started')
    expect(streamText).toContain('event: assistant_message_delta')
    expect(streamText).toContain('event: assistant_message_completed')
    expect(streamText).toContain('"message":{"id":"msg_assistant_1"')
    expect(streamText).toContain('Working on your app now.')
    expect(streamText).toContain('event: run_completed')

    const messagesRes = await app.request(`/projects/${projectBody.project.id}/messages`, {
      headers: {
        cookie,
      },
    })
    const messagesBody = await messagesRes.json()

    expect(messagesBody.items).toHaveLength(2)
    expect(messagesBody.items[0].kind).toBe('user')
    expect(messagesBody.items[1].kind).toBe('assistant')
    expect(runtime.stream).toHaveBeenCalledTimes(1)
    expect(runtime.stream.mock.calls[0][0].userMessage).toBe('Build a todo app')
  })

  it('stores the configured model on new runs', async () => {
    process.env.OPENAI_MODEL = 'gpt-5.3-codex'
    resetEnvCaches()

    const repository = createTestRepository()
    const app = buildApiApp({ repository })
    const cookie = await registerAndGetSessionCookie(app)

    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'Model selection demo',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()

    const createRes = await app.request(`/projects/${projectBody.project.id}/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        userMessage: { text: 'Build a todo app' },
      }),
    })

    expect(createRes.status).toBe(201)

    const createBody = await createRes.json()
    expect(createBody.run.model).toBe('gpt-5.3-codex')
  })

  it('uses the compat runtime by default for proxy gateways', async () => {
    process.env.OPENAI_BASE_URL = 'https://gateway.example.com/v1'
    process.env.OPENAI_RUNTIME = 'auto'
    process.env.OPENAI_REQUEST_HEADERS =
      '{"HTTP-Referer":"https://opencode.ai/","X-Title":"opencode"}'
    resetEnvCaches()

    const repository = createTestRepository()
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_input)).toBe('https://gateway.example.com/v1/chat/completions')
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer sk-test',
        'HTTP-Referer': 'https://opencode.ai/',
        'X-Title': 'opencode',
      })

      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"id":"chatcmpl_1","choices":[{"index":0,"delta":{"content":"Hello from compat"},"finish_reason":null}]}\n\n',
            ),
          )
          controller.enqueue(
            encoder.encode(
              'data: {"id":"chatcmpl_1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
            ),
          )
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })

      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const app = buildApiApp({ repository })
    const cookie = await registerAndGetSessionCookie(app)

    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'Compat runtime demo',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()

    const createRes = await app.request(`/projects/${projectBody.project.id}/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        userMessage: { text: 'Say hello' },
      }),
    })
    const createBody = await createRes.json()

    const streamRes = await app.request(`/runs/${createBody.run.id}/stream`, {
      headers: {
        cookie,
      },
    })
    const streamText = await streamRes.text()

    expect(streamText).toContain('Hello from compat')
    expect(streamText).toContain('event: run_completed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('executes tool requests on the backend and continues the run in a single SSE session', async () => {
    const repository = createTestRepository()
    const stream = vi
      .fn()
      .mockImplementationOnce(async function* () {
        yield {
          type: 'tool_request',
          toolCall: {
            toolCallId: 'tool_1',
            runId: 'ignored-by-route',
            name: 'write',
            input: {
              path: 'app/page.tsx',
              content: 'export default function Page() { return <main>Hello</main> }',
            },
          },
          serializedState: 'state_1',
        }
      })
      .mockImplementationOnce(async function* () {
        yield {
          type: 'assistant_text_completed',
          messageId: 'msg_assistant_2',
          text: 'Tool applied successfully.',
        }
        yield {
          type: 'run_completed',
        }
      })
    const runtime = {
      stream,
    }
    const toolExecutor = {
      execute: vi.fn(async () => ({
        output: { path: 'app/page.tsx', bytes: 58 },
        isError: false,
        filesChanged: ['app/page.tsx'],
        updatedFiles: [
          {
            path: 'app/page.tsx',
            contents: 'export default function Page() { return <main>Hello</main> }',
          },
        ],
        previewUrl: 'http://127.0.0.1:4173',
        logs: [
          {
            ts: '2026-04-09T00:00:00.000Z',
            stream: 'info' as const,
            text: 'Wrote app/page.tsx (58 bytes)',
          },
        ],
      })),
    }
    const app = buildApiApp({
      repository,
      runtime,
      runState: {},
      toolExecutor,
    })
    const cookie = await registerAndGetSessionCookie(app)

    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'Tool demo',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()

    const createRes = await app.request(`/projects/${projectBody.project.id}/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        userMessage: { text: 'Create the homepage file' },
      }),
    })
    const createBody = await createRes.json()

    const firstStreamRes = await app.request(`/runs/${createBody.run.id}/stream`, {
      headers: {
        cookie,
      },
    })
    const firstStreamText = await firstStreamRes.text()

    expect(firstStreamText).toContain('event: tool_call_completed')
    expect(firstStreamText).not.toContain('event: tool_call_requested')
    expect(firstStreamText).not.toContain('event: run_waiting_for_tool')
    expect(firstStreamText).toContain('event: assistant_message_completed')
    expect(firstStreamText).toContain('Tool applied successfully.')
    expect(firstStreamText).toContain('event: run_completed')
    expect(toolExecutor.execute).toHaveBeenCalledTimes(1)
    expect(toolExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        run: expect.objectContaining({ id: createBody.run.id }),
        toolCall: expect.objectContaining({
          toolCallId: 'tool_1',
          name: 'write',
        }),
      }),
    )

    const runStateRes = await app.request(`/runs/${createBody.run.id}`, {
      headers: {
        cookie,
      },
    })

    expect(runStateRes.status).toBe(200)

    const runStateBody = await runStateRes.json()
    expect(runStateBody.pendingToolCall).toBeUndefined()
    expect(runStateBody.run.status).toBe('completed')
    expect(stream).toHaveBeenCalledTimes(2)
    expect(stream.mock.calls[0][0].userMessage).toBe('Create the homepage file')
    expect(stream.mock.calls[1][0].run.serializedState).toBe('state_1')
    expect(stream.mock.calls[1][0].run.waitingToolCallId).toBe('tool_1')

    const persistedToolCalls = await repository.listToolCallsForRun(createBody.run.id)
    expect(persistedToolCalls).toHaveLength(1)
    expect(persistedToolCalls[0]).toMatchObject({
      toolCallId: 'tool_1',
      name: 'write',
      status: 'completed_server',
      clientSequence: 1,
      output: { path: 'app/page.tsx', bytes: 58 },
    })

    const messagesRes = await app.request(`/projects/${projectBody.project.id}/messages`, {
      headers: {
        cookie,
      },
    })
    const messagesBody = await messagesRes.json()
    expect(messagesBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'tool_log',
          toolCallId: 'tool_1',
          toolName: 'write',
        }),
      ]),
    )
  })

  it('returns 404 when cancelling an unknown run', async () => {
    const app = buildApiApp({ repository: createTestRepository() })
    const cookie = await registerAndGetSessionCookie(app)

    const cancelRes = await app.request('/runs/run_missing/cancel', {
      method: 'POST',
      headers: {
        cookie,
      },
    })

    expect(cancelRes.status).toBe(404)
  })

  it('returns a persisted run record from GET /runs/:id', async () => {
    const repository = createTestRepository()
    const app = buildApiApp({ repository })
    const cookie = await registerAndGetSessionCookie(app)
    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'Read run state',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()
    const createRunRes = await app.request(`/projects/${projectBody.project.id}/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        userMessage: { text: 'Build a todo app' },
      }),
    })
    const createRunBody = await createRunRes.json()

    const runRes = await app.request(`/runs/${createRunBody.run.id}`, {
      headers: {
        cookie,
      },
    })

    expect(runRes.status).toBe(200)
    const runBody = await runRes.json()
    expect(runBody.run.id).toBe(createRunBody.run.id)
    expect(runBody.run.projectId).toBe(projectBody.project.id)
  })

  it('streams run events over SSE', async () => {
    const repository = createTestRepository()
    const app = buildApiApp({
      repository,
      runtime: {
        stream: vi.fn(async function* () {
          yield {
            type: 'assistant_text_delta',
            messageId: 'msg_assistant_1',
            delta: 'Hello',
          }
          yield {
            type: 'assistant_text_completed',
            messageId: 'msg_assistant_1',
            text: 'Hello',
          }
          yield {
            type: 'run_completed',
          }
        }),
      },
    })
    const cookie = await registerAndGetSessionCookie(app)
    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'SSE demo',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()
    const createRunRes = await app.request(`/projects/${projectBody.project.id}/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        userMessage: { text: 'Build a todo app' },
      }),
    })
    const createRunBody = await createRunRes.json()

    const streamRes = await app.request(`/runs/${createRunBody.run.id}/stream`, {
      headers: {
        cookie,
      },
    })

    expect(streamRes.status).toBe(200)
    expect(streamRes.headers.get('content-type')).toContain('text/event-stream')

    const body = await streamRes.text()
    expect(body).toContain('event: assistant_message_delta')
    expect(body).toContain('event: run_completed')
  })

  it('uses the compat runtime by default when OPENAI_BASE_URL is configured', async () => {
    process.env.OPENAI_BASE_URL = 'https://gateway.example.com/v1'
    process.env.OPENAI_RESPONSES_URL = ''
    process.env.OPENAI_RUNTIME = 'auto'
    process.env.OPENAI_REQUEST_HEADERS = '{"X-Title":"opencode"}'
    resetEnvCaches()

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer sk-test',
        'X-Title': 'opencode',
      })

      return createSseResponse([
        {
          id: 'chatcmpl_1',
          choices: [{ index: 0, delta: { content: 'Compat hello' }, finish_reason: null }],
        },
        {
          id: 'chatcmpl_1',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        },
        '[DONE]',
      ])
    })
    vi.stubGlobal('fetch', fetchMock)

    const repository = createTestRepository()
    const app = buildApiApp({ repository })
    const cookie = await registerAndGetSessionCookie(app)

    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'Compat runtime demo',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()

    const createRunRes = await app.request(`/projects/${projectBody.project.id}/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        userMessage: { text: 'Build a todo app' },
      }),
    })
    const createRunBody = await createRunRes.json()

    const streamRes = await app.request(`/runs/${createRunBody.run.id}/stream`, {
      headers: {
        cookie,
      },
    })

    const streamText = await streamRes.text()
    expect(streamText).toContain('Compat hello')
    expect(streamText).toContain('event: run_completed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
