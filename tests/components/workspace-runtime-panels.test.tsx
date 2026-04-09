import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Dispatch, SetStateAction } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CodePanel from '@/src/frontend/components/workspace/CodePanel'
import FileTree from '@/src/frontend/components/workspace/FileTree'
import PreviewPanel from '@/src/frontend/components/workspace/PreviewPanel'
import TerminalPanel from '@/src/frontend/components/workspace/TerminalPanel'
import WorkspaceShell from '@/src/frontend/components/workspace/WorkspaceShell'
import type { TimelineItem } from '@/src/frontend/hooks/useWorkspaceState'
import type { WorkspaceFile } from '@/src/frontend/hooks/useWorkspaceState'

const workspaceStateStub = vi.fn()
const runStreamStub = vi.fn()
const eventSourceInstances: FakeEventSource[] = []

class FakeEventSource {
  static CLOSED = 2
  static OPEN = 1
  static CONNECTING = 0

  url: string
  readyState = FakeEventSource.OPEN
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null
  private readonly listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>()

  constructor(url: string | URL) {
    this.url = String(url)
    eventSourceInstances.push(this)
  }

  addEventListener(event: string, listener: (event: MessageEvent<string>) => void) {
    const existing = this.listeners.get(event)
    if (existing) {
      existing.add(listener)
      return
    }
    this.listeners.set(event, new Set([listener]))
  }

  removeEventListener(event: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.get(event)?.delete(listener)
  }

  close() {
    this.readyState = FakeEventSource.CLOSED
  }

  emit(event: string, payload: unknown) {
    const handlers = this.listeners.get(event)
    if (!handlers) {
      return
    }

    const message = {
      data: JSON.stringify(payload),
    } as MessageEvent<string>
    handlers.forEach((handler) => handler(message))
  }
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

function applySetItemsUpdate(
  update: Parameters<Dispatch<SetStateAction<TimelineItem[]>>>[0],
  current: TimelineItem[],
) {
  if (typeof update === 'function') {
    return update(current)
  }

  return update
}

vi.mock('@/src/frontend/hooks/useWorkspaceState', () => ({
  default: (...args: unknown[]) => workspaceStateStub(...args),
}))

vi.mock('@/src/frontend/hooks/useRunStream', () => ({
  default: (...args: unknown[]) => runStreamStub(...args),
}))

describe('workspace runtime panels', () => {
  const runtimeFiles: WorkspaceFile[] = [
    {
      path: 'src/App.tsx',
      contents: 'export function App() { return <main>App</main> }',
    },
    {
      path: 'app/page.tsx',
      contents: 'export default function Page() { return <main>Hello</main> }',
    },
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
    eventSourceInstances.length = 0
    vi.stubGlobal('EventSource', FakeEventSource)
  })

  it('renders file tree entries from workspace files and supports selectFile', async () => {
    const RuntimeFileTree = FileTree as unknown as (props: {
      projectName: string
      files: WorkspaceFile[]
      activeFilePath: string | null
      selectFile: (path: string) => void
    }) => JSX.Element
    const selectFile = vi.fn()

    render(
      <RuntimeFileTree
        projectName="Atoms UI"
        files={runtimeFiles}
        activeFilePath="src/App.tsx"
        selectFile={selectFile}
      />,
    )

    expect(screen.getByText('src/App.tsx')).toBeVisible()
    expect(screen.getByText('app/page.tsx')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'app/page.tsx' }))
    expect(selectFile).toHaveBeenCalledWith('app/page.tsx')
  })

  it('renders code panel from activeFilePath and activeFileContents', () => {
    const RuntimeCodePanel = CodePanel as unknown as (props: {
      activeFilePath: string | null
      activeFileContents: string
    }) => JSX.Element

    render(
      <RuntimeCodePanel
        activeFilePath="app/page.tsx"
        activeFileContents="export default function Page() { return <main>Hello</main> }"
      />,
    )

    expect(screen.getByText('app/page.tsx')).toBeVisible()
    expect(screen.getByText(/<main>Hello<\/main>/)).toBeVisible()
  })

  it('renders terminal panel from terminalLines', () => {
    const RuntimeTerminalPanel = TerminalPanel as unknown as (props: {
      terminalLines: string[]
    }) => JSX.Element

    render(
      <RuntimeTerminalPanel
        terminalLines={[
          '[stdout] npm install complete',
          '[info] serving on http://localhost:4173',
          '[stdout] wrote app/page.tsx',
        ]}
      />,
    )

    expect(screen.getByText(/\[stdout\] npm install complete/)).toBeVisible()
    expect(screen.getByText(/\[info\] serving on http:\/\/localhost:4173/)).toBeVisible()
  })

  it('renders preview iframe and open-in-new-tab link from previewUrl', () => {
    const RuntimePreviewPanel = PreviewPanel as unknown as (props: {
      previewUrl: string | null
    }) => JSX.Element

    render(<RuntimePreviewPanel previewUrl="https://demo-123.webcontainer.app" />)

    const iframe = screen.getByTitle('Workspace preview')
    expect(iframe).toHaveAttribute('src', 'https://demo-123.webcontainer.app')

    const link = screen.getByRole('link', { name: /open in new tab/i })
    expect(link).toHaveAttribute('href', 'https://demo-123.webcontainer.app')
  })

  it('wires workspace state into panels and passes applyToolResult to useRunStream', () => {
    const applyToolResult = vi.fn()
    workspaceStateStub.mockReturnValue({
      projectName: 'Atoms Runtime',
      items: [],
      setItems: vi.fn(),
      activeRunId: 'run_42',
      files: runtimeFiles,
      activeFilePath: 'src/App.tsx',
      activeFileContents: 'export function App() { return <main>App</main> }',
      terminalLines: ['[stdout] npm install complete'],
      previewUrl: 'https://demo-123.webcontainer.app',
      selectFile: vi.fn(),
      applyToolResult,
    })
    runStreamStub.mockReturnValue({
      isRunning: false,
      startRun: vi.fn(),
    })

    render(<WorkspaceShell projectId="proj_1" />)

    expect(runStreamStub).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj_1',
        activeRunId: 'run_42',
        onToolResult: applyToolResult,
      }),
    )
    expect(screen.getByRole('button', { name: 'src/App.tsx' })).toBeVisible()
    expect(screen.getByText(/\[stdout\] npm install complete/)).toBeVisible()
    expect(
      screen.getByRole('link', {
        name: /open in new tab/i,
      }),
    ).toBeVisible()
  })

  it('publishes current files via snapshot + publish APIs, streams SSE updates, and updates preview', async () => {
    let timelineItems: TimelineItem[] = []
    const setItems = vi.fn((update: Parameters<Dispatch<SetStateAction<TimelineItem[]>>>[0]) => {
      timelineItems = applySetItemsUpdate(update, timelineItems)
    })

    workspaceStateStub.mockReturnValue({
      projectName: 'Atoms Runtime',
      items: timelineItems,
      setItems,
      activeRunId: null,
      files: runtimeFiles,
      activeFilePath: 'src/App.tsx',
      activeFileContents: 'export function App() { return <main>App</main> }',
      terminalLines: [],
      previewUrl: null,
      selectFile: vi.fn(),
      applyToolResult: vi.fn(),
    })
    runStreamStub.mockReturnValue({
      isRunning: false,
      startRun: vi.fn(),
    })

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            snapshot: {
              id: 'snp_1',
            },
          },
          true,
          201,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            publishJob: {
              id: 'pub_1',
              status: 'queued',
              deployedUrl: null,
            },
            streamUrl: '/api/publish/pub_1/stream',
          },
          true,
          202,
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(<WorkspaceShell projectId="proj_1" />)
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/projects/proj_1/snapshots',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    const snapshotRequest = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(snapshotRequest?.body).toBeInstanceOf(FormData)
    expect((snapshotRequest?.body as FormData).get('file')).toBeInstanceOf(File)

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/projects/proj_1/publish',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          snapshotId: 'snp_1',
        }),
      }),
    )
    expect(eventSourceInstances).toHaveLength(1)
    expect(eventSourceInstances[0]?.url).toBe('/api/publish/pub_1/stream')

    eventSourceInstances[0]?.emit('publish_updated', {
      publishJob: {
        id: 'pub_1',
        status: 'uploading',
        deployedUrl: null,
      },
    })
    eventSourceInstances[0]?.emit('publish_updated', {
      publishJob: {
        id: 'pub_1',
        status: 'ready',
        deployedUrl: 'https://prod-1.example.vercel.app',
      },
    })

    workspaceStateStub.mockReturnValue({
      projectName: 'Atoms Runtime',
      items: timelineItems,
      setItems,
      activeRunId: null,
      files: runtimeFiles,
      activeFilePath: 'src/App.tsx',
      activeFileContents: 'export function App() { return <main>App</main> }',
      terminalLines: [],
      previewUrl: null,
      selectFile: vi.fn(),
      applyToolResult: vi.fn(),
    })
    rerender(<WorkspaceShell projectId="proj_1" />)

    expect(screen.getByTitle('Workspace preview')).toHaveAttribute(
      'src',
      'https://prod-1.example.vercel.app',
    )
    expect(
      screen.getByRole('link', {
        name: /open in new tab/i,
      }),
    ).toHaveAttribute('href', 'https://prod-1.example.vercel.app')
    expect(
      timelineItems.some(
        (item) =>
          item.role === 'tool_log' &&
          item.summary.toLowerCase().includes('publish') &&
          item.logs?.some((line) => line.includes('ready')),
      ),
    ).toBe(true)
  })
})
