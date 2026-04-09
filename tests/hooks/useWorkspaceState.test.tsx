import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import useWorkspaceState from '@/src/frontend/hooks/useWorkspaceState'

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response
}

describe('useWorkspaceState', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads project metadata, workspace files, timeline messages, and active run state', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          project: {
            id: 'proj_1',
            name: 'Atoms Project',
            deployedUrl: 'https://deploy.example.com',
          },
          latestRun: {
            id: 'run_1',
            status: 'running',
          },
          workspace: {
            files: [
              {
                path: 'src/app.ts',
                contents: 'export const app = true\n',
              },
              {
                path: 'app/page.tsx',
                contents: 'export default function Page() { return <main>Hello</main> }\n',
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            { id: 'm_user', kind: 'user', text: 'Build a todo app' },
            { id: 'm_assistant', kind: 'assistant', text: 'Starting now.' },
            {
              id: 'm_tool',
              kind: 'tool_log',
              summary: 'write {"path":"app/page.tsx"}',
              logs: ['Wrote app/page.tsx (58 bytes)'],
            },
          ],
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useWorkspaceState('proj_1'))

    await waitFor(() => {
      expect(result.current.projectName).toBe('Atoms Project')
      expect(result.current.files).toEqual([
        {
          path: 'app/page.tsx',
          contents: 'export default function Page() { return <main>Hello</main> }\n',
        },
        {
          path: 'src/app.ts',
          contents: 'export const app = true\n',
        },
      ])
    })

    expect(result.current.activeFilePath).toBe('app/page.tsx')
    expect(result.current.activeFileContents).toBe(
      'export default function Page() { return <main>Hello</main> }\n',
    )
    expect(result.current.previewUrl).toBe('https://deploy.example.com')
    expect(result.current.activeRunId).toBe('run_1')
    expect(result.current.items).toEqual([
      { id: 'm_user', role: 'user', content: 'Build a todo app' },
      { id: 'm_assistant', role: 'assistant', content: 'Starting now.' },
      {
        id: 'm_tool',
        role: 'tool_log',
        summary: 'write {"path":"app/page.tsx"}',
        logs: ['Wrote app/page.tsx (58 bytes)'],
      },
    ])

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/projects/proj_1', expect.anything())
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/projects/proj_1/messages?limit=100',
      expect.anything(),
    )
  })

  it('applies write tool results into files, terminal, and preview state', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          project: {
            id: 'proj_1',
            name: 'Atoms Project',
          },
          workspace: {
            files: [],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useWorkspaceState('proj_1'))

    await waitFor(() => {
      expect(result.current.projectName).toBe('Atoms Project')
    })

    act(() => {
      result.current.applyToolResult({
        call: {
          toolCallId: 'tool_1',
          runId: 'run_1',
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

    expect(result.current.files).toEqual([
      {
        path: 'app/page.tsx',
        contents: 'export default function Page() { return <main>Hello</main> }',
      },
    ])
    expect(result.current.activeFilePath).toBe('app/page.tsx')
    expect(result.current.activeFileContents).toContain('<main>Hello</main>')
    expect(result.current.terminalLines).toEqual(['Wrote app/page.tsx (58 bytes)'])
    expect(result.current.previewUrl).toBe('http://localhost:3000')
  })

  it('applies bash tool results from updatedFiles and filesChanged into workspace state', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          project: {
            id: 'proj_1',
            name: 'Atoms Project',
          },
          workspace: {
            files: [
              {
                path: 'app/page.tsx',
                contents: 'export default function Page() { return <main>Before</main> }',
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useWorkspaceState('proj_1'))

    await waitFor(() => {
      expect(result.current.projectName).toBe('Atoms Project')
    })

    act(() => {
      result.current.applyToolResult({
        call: {
          toolCallId: 'tool_2',
          runId: 'run_1',
          name: 'bash',
          input: {
            command: 'pnpm install',
          },
        },
        result: {
          toolCallId: 'tool_2',
          output: {
            command: 'pnpm install',
            exitCode: 0,
            output: 'Done in 1.2s',
          },
          isError: false,
          updatedFiles: [
            {
              path: 'package.json',
              contents: '{\n  "name": "atoms-project"\n}\n',
            },
            {
              path: 'app/page.tsx',
              contents: 'export default function Page() { return <main>After</main> }',
            },
          ],
          previewUrl: 'http://localhost:3000',
          logs: [
            {
              ts: '2026-04-09T00:00:01.000Z',
              stream: 'stdout',
              text: 'Done in 1.2s',
            },
          ],
          clientSequence: 1,
        },
      })
    })

    expect(result.current.files).toEqual([
      {
        path: 'app/page.tsx',
        contents: 'export default function Page() { return <main>After</main> }',
      },
      {
        path: 'package.json',
        contents: '{\n  "name": "atoms-project"\n}\n',
      },
    ])
    expect(result.current.activeFilePath).toBe('package.json')
    expect(result.current.activeFileContents).toBe('{\n  "name": "atoms-project"\n}\n')
    expect(result.current.terminalLines).toEqual(['Done in 1.2s'])
    expect(result.current.previewUrl).toBe('http://localhost:3000')

    act(() => {
      result.current.applyToolResult({
        call: {
          toolCallId: 'tool_3',
          runId: 'run_1',
          name: 'bash',
          input: {
            command: 'touch README.md',
          },
        },
        result: {
          toolCallId: 'tool_3',
          output: {
            command: 'touch README.md',
            exitCode: 0,
            output: '',
          },
          isError: false,
          filesChanged: ['README.md'],
          clientSequence: 2,
        },
      })
    })

    expect(result.current.files).toContainEqual({
      path: 'README.md',
      contents: '',
    })
    expect(result.current.terminalLines).toEqual(['Done in 1.2s', 'bash completed'])
    expect(result.current.previewUrl).toBe('http://localhost:3000')
  })
})
