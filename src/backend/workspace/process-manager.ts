import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'

type LogLine = {
  stream: 'stdout' | 'stderr' | 'info'
  text: string
}

type CommandResult = {
  command: string
  cwd?: string
  exitCode: number
  output: string
  durationMs: number
  logs: LogLine[]
  previewUrl?: string | null
}

type ManagedServer = {
  projectId: string
  port: number
  previewUrl: string
  process: ChildProcess
}

function splitLines(text: string, stream: LogLine['stream']) {
  return text
    .split(/\r?\n/g)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => ({
      stream,
      text: line,
    }))
}

function collectOutput(child: ChildProcess) {
  let stdout = ''
  let stderr = ''

  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk) => {
    stdout += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk)
  })

  return () => ({
    stdout,
    stderr,
  })
}

async function getAvailablePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate preview port')))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}

async function waitForPort(port: number, timeoutMs: number) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const isReachable = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ port, host: '127.0.0.1' })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        resolve(false)
      })
    })

    if (isReachable) {
      return
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 150)
    })
  }

  throw new Error(`Timed out waiting for server on port ${port}`)
}

function killProcessTree(child: ChildProcess) {
  if (!child.pid) {
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {
      // Ignore process shutdown errors.
    }
  }
}

function looksLikeServerCommand(command: string) {
  return /\b(dev|serve|preview|start|http\.server)\b/i.test(command)
}

export function createProcessManager() {
  const servers = new Map<string, ManagedServer>()

  async function stopProjectServer(projectId: string) {
    const existingServer = servers.get(projectId)
    if (!existingServer) {
      return
    }

    killProcessTree(existingServer.process)
    servers.delete(projectId)
  }

  return {
    async run(projectId: string, command: string, cwd: string) {
      if (looksLikeServerCommand(command)) {
        await stopProjectServer(projectId)

        const port = await getAvailablePort()
        const previewUrl = `http://127.0.0.1:${port}`
        const startedAt = Date.now()
        const child = spawn('/bin/sh', ['-lc', command], {
          cwd,
          detached: true,
          env: {
            ...process.env,
            PORT: String(port),
            HOST: '127.0.0.1',
            npm_config_port: String(port),
            BROWSER: 'none',
            CI: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        const getOutput = collectOutput(child)

        child.unref()

        try {
          await waitForPort(port, 15000)
        } catch (error) {
          const { stdout, stderr } = getOutput()
          killProcessTree(child)
          throw new Error(
            [error instanceof Error ? error.message : 'Failed to start preview server', stdout, stderr]
              .filter((entry) => entry && String(entry).trim().length > 0)
              .join('\n'),
          )
        }

        child.once('close', () => {
          const current = servers.get(projectId)
          if (current?.process.pid === child.pid) {
            servers.delete(projectId)
          }
        })

        servers.set(projectId, {
          projectId,
          port,
          previewUrl,
          process: child,
        })

        const { stdout, stderr } = getOutput()
        const durationMs = Date.now() - startedAt
        const logs = [
          ...splitLines(stdout, 'stdout'),
          ...splitLines(stderr, 'stderr'),
          {
            stream: 'info' as const,
            text: `Preview ready at ${previewUrl}`,
          },
        ]

        return {
          command,
          cwd,
          exitCode: 0,
          output: [stdout, stderr].filter((entry) => entry.trim().length > 0).join('\n').trim(),
          durationMs,
          logs,
          previewUrl,
        } satisfies CommandResult
      }

      const startedAt = Date.now()
      const child = spawn('/bin/sh', ['-lc', command], {
        cwd,
        env: {
          ...process.env,
          CI: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const getOutput = collectOutput(child)

      const timeout = setTimeout(() => {
        killProcessTree(child)
      }, 20000)

      const exitCode = await new Promise<number>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code) => resolve(code ?? 1))
      }).finally(() => {
        clearTimeout(timeout)
      })

      const { stdout, stderr } = getOutput()
      const logs = [
        ...splitLines(stdout, 'stdout'),
        ...splitLines(stderr, 'stderr'),
      ]

      if (logs.length === 0 && exitCode !== 0) {
        logs.push({
          stream: 'stderr',
          text: `Command exited with code ${exitCode}`,
        })
      }

      return {
        command,
        cwd,
        exitCode,
        output: [stdout, stderr].filter((entry) => entry.trim().length > 0).join('\n').trim(),
        durationMs: Date.now() - startedAt,
        logs,
        previewUrl: this.getPreviewUrl(projectId),
      } satisfies CommandResult
    },
    getPreviewUrl(projectId: string) {
      return servers.get(projectId)?.previewUrl ?? null
    },
    async stop(projectId: string) {
      await stopProjectServer(projectId)
    },
  }
}

export const processManager = createProcessManager()
