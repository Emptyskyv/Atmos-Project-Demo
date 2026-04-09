import { describe, expect, it } from 'vitest'
import { createToolBridge } from '@/src/frontend/workspace/bridge'

describe('createToolBridge', () => {
  it('converts a write tool call into a tool result payload with logs', async () => {
    const bridge = createToolBridge({
      executeWriteFile: async (path, content) => ({
        path,
        bytes: content.length,
        previewUrl: 'http://localhost:4173',
      }),
    })

    const result = await bridge.execute({
      toolCallId: 'tool_1',
      runId: 'run_1',
      name: 'write',
      input: { path: 'app/page.tsx', content: 'export default function Page() { return null }' },
    })

    expect(result.toolCallId).toBe('tool_1')
    expect(result.isError).toBe(false)
    expect(result.filesChanged).toEqual(['app/page.tsx'])
    expect(result.previewUrl).toBe('http://localhost:4173')
    expect(result.logs?.[0]?.text).toContain('app/page.tsx')
  })

  it('converts a bash tool call into command output with duration and logs', async () => {
    const bridge = createToolBridge({
      executeWriteFile: async (path, content) => ({
        path,
        bytes: content.length,
      }),
      executeRunCommand: async (command, args) => ({
        command,
        args,
        exitCode: 0,
        output: 'ready',
        durationMs: 1200,
        filesChanged: ['package-lock.json'],
        logs: [{ stream: 'stdout', text: 'ready' }],
      }),
    })

    const result = await bridge.execute({
      toolCallId: 'tool_2',
      runId: 'run_1',
      name: 'bash',
      input: { command: 'npm install' },
    })

    expect(result.toolCallId).toBe('tool_2')
    expect(result.isError).toBe(false)
    expect(result.output).toMatchObject({
      command: 'npm install',
      args: [],
      exitCode: 0,
      output: 'ready',
    })
    expect(result.durationMs).toBe(1200)
    expect(result.filesChanged).toEqual(['package-lock.json'])
    expect(result.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stream: 'stdout', text: 'ready' }),
      ]),
    )
  })

  it('surfaces preview information when a bash command returns a preview url', async () => {
    const bridge = createToolBridge({
      executeWriteFile: async (path, content) => ({
        path,
        bytes: content.length,
      }),
      executeRunCommand: async (command, args) => ({
        command,
        args,
        exitCode: 0,
        output: 'server started',
        durationMs: 3400,
        previewUrl: 'http://localhost:5173',
        logs: [{ stream: 'info', text: 'Server ready at http://localhost:5173' }],
      }),
    })

    const result = await bridge.execute({
      toolCallId: 'tool_3',
      runId: 'run_1',
      name: 'bash',
      input: { command: 'npm run dev' },
    })

    expect(result.toolCallId).toBe('tool_3')
    expect(result.isError).toBe(false)
    expect(result.previewUrl).toBe('http://localhost:5173')
    expect(result.durationMs).toBe(3400)
    expect(result.output).toMatchObject({
      command: 'npm run dev',
      args: [],
      output: 'server started',
    })
    expect(result.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stream: 'info', text: 'Server ready at http://localhost:5173' }),
      ]),
    )
  })
})
