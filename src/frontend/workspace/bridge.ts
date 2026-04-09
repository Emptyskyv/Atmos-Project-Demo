import type { ToolCallRequest, ToolResultPayload } from '@/src/shared/agent/tools/serializers'

type LogLine = {
  stream: 'stdout' | 'stderr' | 'info'
  text: string
}

type RunCommandResult = {
  command: string
  args?: string[]
  cwd?: string
  exitCode: number
  output?: string
  durationMs?: number
  filesChanged?: string[]
  previewUrl?: string | null
  logs?: LogLine[]
}

type StartDevServerResult = {
  command: string
  args?: string[]
  cwd?: string
  port?: number
  previewUrl: string | null
  output?: string
  durationMs?: number
  filesChanged?: string[]
  logs?: LogLine[]
}

type BridgeDeps = {
  executeWriteFile: (
    path: string,
    contents: string,
  ) => Promise<{ path: string; bytes: number; previewUrl?: string | null }>
  executeRunCommand?: (command: string, args: string[], cwd?: string) => Promise<RunCommandResult>
  executeStartDevServer?: (
    command: string,
    args: string[],
    port?: number,
    cwd?: string,
  ) => Promise<StartDevServerResult>
}

function nowIso() {
  return new Date().toISOString()
}

function toLogEntries(logs: LogLine[] | undefined, fallback: string[] = []): ToolResultPayload['logs'] {
  if (logs?.length) {
    return logs.map((line) => ({
      ts: nowIso(),
      stream: line.stream,
      text: line.text,
    }))
  }

  return fallback.map((line) => ({
    ts: nowIso(),
    stream: 'info' as const,
    text: line,
  }))
}

function unsupportedToolResult(call: ToolCallRequest): ToolResultPayload {
  return {
    toolCallId: call.toolCallId,
    output: { message: `Unsupported tool ${call.name}` },
    isError: true,
    logs: [
      {
        ts: nowIso(),
        stream: 'stderr',
        text: `Unsupported tool ${call.name}`,
      },
    ],
    clientSequence: 0,
  }
}

export function createToolBridge(deps: BridgeDeps) {
  return {
    async execute(call: ToolCallRequest): Promise<ToolResultPayload> {
      if (call.name === 'write') {
        const path = String(call.input.path)
        const contents = String(call.input.content)

        try {
          const output = await deps.executeWriteFile(path, contents)

          return {
            toolCallId: call.toolCallId,
            output,
            isError: false,
            filesChanged: [path],
            previewUrl: output.previewUrl ?? null,
            logs: [
              {
                ts: nowIso(),
                stream: 'info',
                text: `Wrote ${path} (${output.bytes} bytes)`,
              },
            ],
            clientSequence: 0,
          }
        } catch (error) {
          return {
            toolCallId: call.toolCallId,
            output: {
              message: error instanceof Error ? error.message : 'Unexpected bridge error',
            },
            isError: true,
            filesChanged: [path],
            logs: [
              {
                ts: nowIso(),
                stream: 'stderr',
                text: error instanceof Error ? error.message : 'Unexpected bridge error',
              },
            ],
            clientSequence: 0,
          }
        }
      }

      if (call.name === 'bash') {
        if (!deps.executeRunCommand) {
          return unsupportedToolResult(call)
        }

        const command = String(call.input.command ?? '')
        const args: string[] = []
        const cwd = typeof call.input.cwd === 'string' ? call.input.cwd : undefined

        try {
          const output = await deps.executeRunCommand(command, args, cwd)
          const outputText = output.output ?? ''

          return {
            toolCallId: call.toolCallId,
            output: {
              command: output.command,
              args: output.args ?? args,
              cwd: output.cwd ?? cwd,
              exitCode: output.exitCode,
              output: outputText,
            },
            isError: output.exitCode !== 0,
            durationMs: output.durationMs,
            filesChanged: output.filesChanged,
            previewUrl: output.previewUrl,
            logs: toLogEntries(output.logs, outputText ? [outputText] : []),
            clientSequence: 0,
          }
        } catch (error) {
          return {
            toolCallId: call.toolCallId,
            output: {
              command,
              args,
              cwd,
              message: error instanceof Error ? error.message : 'Unexpected bridge error',
            },
            isError: true,
            logs: [
              {
                ts: nowIso(),
                stream: 'stderr',
                text: error instanceof Error ? error.message : 'Unexpected bridge error',
              },
            ],
            clientSequence: 0,
          }
        }
      }

      return unsupportedToolResult(call)
    },
  }
}
