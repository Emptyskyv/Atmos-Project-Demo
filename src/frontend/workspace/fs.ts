import { getWebContainer } from '@/src/frontend/workspace/client'

type StreamKind = 'stdout' | 'stderr' | 'info'

type LogLine = {
  stream: StreamKind
  text: string
}

type SpawnedProcess = {
  output?: ReadableStream<unknown>
  exit: Promise<number>
}

function parentDir(path: string) {
  const normalized = path.replace(/^\/+/, '').replace(/\/+$/, '')
  const parts = normalized.split('/')

  if (parts.length <= 1) {
    return null
  }

  return parts.slice(0, -1).join('/')
}

function toText(chunk: unknown): string {
  if (typeof chunk === 'string') {
    return chunk
  }

  if (chunk instanceof Uint8Array) {
    return new TextDecoder().decode(chunk)
  }

  return String(chunk)
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/g)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
}

async function readAllOutput(process: SpawnedProcess): Promise<string> {
  if (!process.output) {
    return ''
  }

  let output = ''
  await process.output.pipeTo(
    new WritableStream<unknown>({
      write(chunk) {
        output += toText(chunk)
      },
    }),
  )
  return output
}

function captureOutputSnapshot(process: SpawnedProcess) {
  let output = ''

  if (process.output) {
    const reader = process.output.getReader()
    void (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) {
            break
          }
          output += toText(value)
        }
      } catch {
        // Ignore stream read errors from process termination or restart.
      } finally {
        reader.releaseLock()
      }
    })()
  }

  return () => output
}

export async function writeFile(path: string, contents: string) {
  const wc = await getWebContainer()
  const directory = parentDir(path)

  if (directory) {
    await wc.fs.mkdir(directory, { recursive: true })
  }

  await wc.fs.writeFile(path, contents)

  return { path, bytes: contents.length }
}

export async function runCommand(command: string, args: string[] = [], cwd?: string) {
  const wc = await getWebContainer()
  const startedAt = Date.now()
  const process = (await wc.spawn(command, args, cwd ? { cwd } : undefined)) as SpawnedProcess
  const outputPromise = readAllOutput(process)
  const exitCode = await process.exit
  const output = (await outputPromise).trim()
  const durationMs = Date.now() - startedAt
  const logs: LogLine[] = splitLines(output).map((line) => ({
    stream: 'stdout',
    text: line,
  }))

  if (logs.length === 0 && exitCode !== 0) {
    logs.push({
      stream: 'stderr',
      text: `Command exited with code ${exitCode}`,
    })
  }

  return {
    command,
    args,
    cwd,
    exitCode,
    output,
    durationMs,
    logs,
  }
}

export async function startDevServer(
  command: string = 'npm',
  args: string[] = ['run', 'dev'],
  port?: number,
  cwd?: string,
) {
  const wc = await getWebContainer()
  const startedAt = Date.now()
  const process = (await wc.spawn(command, args, cwd ? { cwd } : undefined)) as SpawnedProcess
  const outputSnapshot = captureOutputSnapshot(process)

  let serverPort: number | undefined
  let previewUrl: string | null = null
  let offServerReady: (() => void) | undefined

  const serverReadyPromise = new Promise<void>((resolve) => {
    const unsubscribe = wc.on('server-ready', (readyPort, url) => {
      if (typeof port === 'number' && readyPort !== port) {
        return
      }

      serverPort = readyPort
      previewUrl = url
      resolve()
    })

    if (typeof unsubscribe === 'function') {
      offServerReady = unsubscribe
    }
  })

  try {
    await Promise.race([
      serverReadyPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Timed out waiting for dev server readiness'))
        }, 15000)
      }),
    ])
  } finally {
    offServerReady?.()
  }

  const output = outputSnapshot().trim()
  const durationMs = Date.now() - startedAt
  const logs: LogLine[] = splitLines(output).map((line) => ({
    stream: 'stdout',
    text: line,
  }))

  if (previewUrl) {
    logs.push({
      stream: 'info',
      text: `Dev server ready at ${previewUrl}`,
    })
  }

  return {
    command,
    args,
    cwd,
    port: serverPort ?? port,
    previewUrl,
    output,
    durationMs,
    logs,
  }
}
