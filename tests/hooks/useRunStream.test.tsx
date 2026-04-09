import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import useRunStream from '@/src/frontend/hooks/useRunStream'
import type { TimelineItem } from '@/src/frontend/hooks/useWorkspaceState'

type Listener = (event: MessageEvent<string>) => void

class MockEventSource {
  static instances: MockEventSource[] = []

  private listeners = new Map<string, Set<Listener>>()
  url: string
  closed = false
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }

    this.listeners.get(type)?.add(listener)
  }

  close() {
    this.closed = true
  }

  emit(type: string, payload: unknown) {
    const event = {
      data: JSON.stringify(payload),
    } as MessageEvent<string>

    this.listeners.get(type)?.forEach((listener) => listener(event))
  }
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

describe('useRunStream', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.restoreAllMocks()
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource)
  })

  it('creates a run, streams assistant completion, and closes on run completion', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          run: { id: 'run_1' },
          streamUrl: '/api/runs/run_1/stream',
        },
        true,
        201,
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => {
      const [items, setItems] = useState<TimelineItem[]>([])
      const stream = useRunStream({ projectId: 'proj_1', setItems })
      return { ...stream, items }
    })

    await act(async () => {
      await result.current.startRun('  Build a dashboard  ')
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/proj_1/runs', expect.anything())
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      userMessage: {
        text: 'Build a dashboard',
      },
    })
    expect(MockEventSource.instances[0]?.url).toBe('/api/runs/run_1/stream')

    act(() => {
      MockEventSource.instances[0]?.emit('assistant_message_delta', {
        messageId: 'msg_1',
        delta: 'Working ',
      })
      MockEventSource.instances[0]?.emit('assistant_message_completed', {
        message: {
          id: 'msg_1',
          text: 'Working on it now.',
        },
      })
      MockEventSource.instances[0]?.emit('run_completed', {
        run: { id: 'run_1' },
      })
    })

    await waitFor(() => {
      expect(result.current.items).toEqual([
        { id: 'run_1-user', role: 'user', content: 'Build a dashboard' },
        { id: 'msg_1', role: 'assistant', content: 'Working on it now.' },
      ])
      expect(result.current.isRunning).toBe(false)
      expect(MockEventSource.instances[0]?.closed).toBe(true)
    })
  })

  it('consumes tool_call_completed events and forwards tool results', async () => {
    const onToolResult = vi.fn()

    const { result } = renderHook(() => {
      const [items, setItems] = useState<TimelineItem[]>([])
      const stream = useRunStream({
        projectId: 'proj_1',
        activeRunId: 'run_2',
        setItems,
        onToolResult,
      })
      return { ...stream, items }
    })

    expect(MockEventSource.instances[0]?.url).toBe('/api/runs/run_2/stream')

    act(() => {
      MockEventSource.instances[0]?.emit('tool_call_completed', {
        runId: 'run_2',
        toolCall: {
          toolCallId: 'tool_1',
          runId: 'run_2',
          name: 'write',
          input: {
            path: 'app/page.tsx',
            content: 'export default function Page() { return <main>Hello</main> }',
          },
        },
        result: {
          toolCallId: 'tool_1',
          output: { path: 'app/page.tsx', bytes: 58 },
          isError: false,
          updatedFiles: [
            {
              path: 'app/page.tsx',
              contents: 'export default function Page() { return <main>Hello</main> }',
            },
          ],
          previewUrl: 'http://localhost:3000',
          logs: [
            {
              ts: '2026-04-09T00:00:00.000Z',
              stream: 'info',
              text: 'Wrote app/page.tsx (58 bytes)',
            },
          ],
          clientSequence: 0,
        },
        toolLog: {
          toolCallId: 'tool_1',
          summary: 'write {"path":"app/page.tsx"}',
          logs: ['Wrote app/page.tsx (58 bytes)'],
        },
      })
    })

    await waitFor(() => {
      expect(result.current.items).toEqual([
        {
          id: 'tool-log-tool_1',
          role: 'tool_log',
          summary: 'write {"path":"app/page.tsx"}',
          logs: ['Wrote app/page.tsx (58 bytes)'],
        },
      ])
    })

    expect(onToolResult).toHaveBeenCalledWith({
      call: {
        toolCallId: 'tool_1',
        runId: 'run_2',
        name: 'write',
        input: {
          path: 'app/page.tsx',
          content: 'export default function Page() { return <main>Hello</main> }',
        },
      },
      result: {
        toolCallId: 'tool_1',
        output: { path: 'app/page.tsx', bytes: 58 },
        isError: false,
        updatedFiles: [
          {
            path: 'app/page.tsx',
            contents: 'export default function Page() { return <main>Hello</main> }',
          },
        ],
        previewUrl: 'http://localhost:3000',
        logs: [
          {
            ts: '2026-04-09T00:00:00.000Z',
            stream: 'info',
            text: 'Wrote app/page.tsx (58 bytes)',
          },
        ],
        clientSequence: 0,
      },
    })
  })

  it('appends a failure log and stops the stream when the run fails', async () => {
    const { result } = renderHook(() => {
      const [items, setItems] = useState<TimelineItem[]>([])
      const stream = useRunStream({ projectId: 'proj_1', activeRunId: 'run_3', setItems })
      return { ...stream, items }
    })

    act(() => {
      MockEventSource.instances[0]?.emit('run_failed', {
        error: {
          message: 'Upstream model error',
        },
      })
    })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
      expect(result.current.items[0]).toEqual(
        expect.objectContaining({
          role: 'tool_log',
          summary: 'run failed',
          logs: ['Upstream model error'],
        }),
      )
      expect(result.current.isRunning).toBe(false)
      expect(MockEventSource.instances[0]?.closed).toBe(true)
    })
  })

  it('restores an active run stream and only reopens when the run id changes', async () => {
    const { result, rerender } = renderHook(
      ({ activeRunId }: { activeRunId: string | null }) => {
        const [items, setItems] = useState<TimelineItem[]>([])
        const stream = useRunStream({ projectId: 'proj_1', activeRunId, setItems })
        return { ...stream, items }
      },
      {
        initialProps: { activeRunId: 'run_restore' },
      },
    )

    expect(MockEventSource.instances).toHaveLength(1)
    expect(MockEventSource.instances[0]?.url).toBe('/api/runs/run_restore/stream')
    expect(result.current.isRunning).toBe(true)

    rerender({ activeRunId: 'run_restore' })

    expect(MockEventSource.instances).toHaveLength(1)

    rerender({ activeRunId: 'run_next' })

    expect(MockEventSource.instances).toHaveLength(2)
    expect(MockEventSource.instances[0]?.closed).toBe(true)
    expect(MockEventSource.instances[1]?.url).toBe('/api/runs/run_next/stream')
  })
})
