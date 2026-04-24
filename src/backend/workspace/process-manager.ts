import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { buildPreviewProxyBasePath } from '@/src/backend/workspace/preview-path'

const execFileAsync = promisify(execFile)

const DEFAULT_COMMAND_TIMEOUT_MS = 20_000
const SERVER_READY_TIMEOUT_MS = 15_000
const SHELL_STATUS_POLL_INTERVAL_MS = 25
const SHELL_TIMEOUT_GRACE_MS = 1_000

type LogLine = {
  stream: 'stdout' | 'stderr' | 'info'
  text: string
}

type CommandResult = {
  command: string
  cwd: string
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

type RunOptions =
  | string
  | {
      workspaceDir: string
      cwd?: string
    }

type ShellExecutionResult = {
  stdout: string
  stderr: string
  exitCode: number
  cwd: string
  env: NodeJS.ProcessEnv
}

function getDefaultShellPath() {
  return process.env.SHELL || '/bin/bash'
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
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

    await sleep(150)
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

async function waitForNonEmptyFile(targetPath: string, timeoutMs: number) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const info = await stat(targetPath)
      if (info.size > 0) {
        return true
      }
    } catch {
      // Ignore missing files until timeout expires.
    }

    await sleep(SHELL_STATUS_POLL_INTERVAL_MS)
  }

  return false
}

async function readFileOrEmpty(targetPath: string) {
  try {
    return await readFile(targetPath, 'utf8')
  } catch {
    return ''
  }
}

async function writeToShell(shell: ChildProcess, contents: string) {
  const stdin = shell.stdin
  if (!stdin) {
    throw new Error('Shell stdin is unavailable')
  }

  return await new Promise<void>((resolve, reject) => {
    stdin.write(contents, 'utf8', (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function parseEnvSnapshot(snapshot: string) {
  const nextEnv = {} as NodeJS.ProcessEnv

  for (const entry of snapshot.split('\u0000')) {
    if (entry.length === 0) {
      continue
    }

    const separatorIndex = entry.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    nextEnv[entry.slice(0, separatorIndex)] = entry.slice(separatorIndex + 1)
  }

  return nextEnv
}

class PersistentShellSession {
  private readonly shell: ChildProcess
  private isAlive = true
  private cwd: string
  private env: NodeJS.ProcessEnv
  private queue: Promise<unknown> = Promise.resolve()

  constructor(initialCwd: string) {
    this.cwd = initialCwd
    this.env = {
      ...process.env,
      GIT_EDITOR: 'true',
    }
    this.shell = spawn(getDefaultShellPath(), ['-l'], {
      cwd: initialCwd,
      env: this.env,
      stdio: ['pipe', 'ignore', 'ignore'],
    })

    this.shell.once('error', () => {
      this.isAlive = false
    })
    this.shell.once('exit', () => {
      this.isAlive = false
    })
  }

  get currentCwd() {
    return this.cwd
  }

  get currentEnv() {
    return { ...this.env }
  }

  get alive() {
    return this.isAlive && !this.shell.stdin?.destroyed
  }

  setCurrentCwd(nextCwd: string) {
    this.cwd = nextCwd
  }

  async exec(command: string, explicitCwd?: string, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
    const execution = this.queue.then(() => this.execInternal(command, explicitCwd, timeoutMs))
    this.queue = execution.catch(() => undefined)
    return await execution
  }

  async close() {
    if (!this.alive) {
      return
    }

    await writeToShell(this.shell, 'exit\n').catch(() => undefined)
    killProcessTree(this.shell)
    this.isAlive = false
  }

  private async execInternal(
    command: string,
    explicitCwd?: string,
    timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  ): Promise<ShellExecutionResult> {
    if (!this.alive) {
      throw new Error('Shell session is not running')
    }

    const effectiveCwd = explicitCwd ?? this.cwd
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'atoms-shell-'))
    const stdoutFile = path.join(tempDir, 'stdout.log')
    const stderrFile = path.join(tempDir, 'stderr.log')
    const statusFile = path.join(tempDir, 'status.log')
    const cwdFile = path.join(tempDir, 'cwd.log')
    const envFile = path.join(tempDir, 'env.log')

    const script = [
      `if cd ${shellQuote(effectiveCwd)} 2> ${shellQuote(stderrFile)}; then`,
      `  eval ${shellQuote(command)} < /dev/null > ${shellQuote(stdoutFile)} 2>> ${shellQuote(stderrFile)}`,
      '  EXEC_EXIT_CODE=$?',
      'else',
      `  : > ${shellQuote(stdoutFile)}`,
      '  EXEC_EXIT_CODE=1',
      'fi',
      `pwd > ${shellQuote(cwdFile)}`,
      `env -0 > ${shellQuote(envFile)}`,
      `echo $EXEC_EXIT_CODE > ${shellQuote(statusFile)}`,
      '',
    ].join('\n')

    let interrupted = false

    try {
      await writeToShell(this.shell, script)

      const completedInTime = await waitForNonEmptyFile(statusFile, timeoutMs)
      if (!completedInTime) {
        interrupted = true
        await this.killChildren()
        await waitForNonEmptyFile(statusFile, SHELL_TIMEOUT_GRACE_MS)
      }

      const [stdout, stderrContents, exitCodeContents, nextCwdContents, envSnapshot] = await Promise.all([
        readFileOrEmpty(stdoutFile),
        readFileOrEmpty(stderrFile),
        readFileOrEmpty(statusFile),
        readFileOrEmpty(cwdFile),
        readFileOrEmpty(envFile),
      ])

      let exitCode = Number.parseInt(exitCodeContents.trim(), 10)
      if (!Number.isFinite(exitCode)) {
        exitCode = interrupted ? 143 : 1
      }

      let stderr = stderrContents.trimEnd()
      if (interrupted) {
        stderr = [stderr, 'Command execution timed out or was interrupted']
          .filter((entry) => entry.length > 0)
          .join('\n')
      }

      const nextCwd = nextCwdContents.trim() || effectiveCwd
      const nextEnv = parseEnvSnapshot(envSnapshot)

      this.cwd = nextCwd
      if (Object.keys(nextEnv).length > 0) {
        this.env = nextEnv
      }

      return {
        stdout: stdout.trimEnd(),
        stderr,
        exitCode,
        cwd: this.cwd,
        env: this.currentEnv,
      }
    } finally {
      await rm(tempDir, {
        recursive: true,
        force: true,
      }).catch(() => undefined)
    }
  }

  private async killChildren() {
    const shellPid = this.shell.pid
    if (!shellPid) {
      return
    }

    try {
      const { stdout } = await execFileAsync('pgrep', ['-P', String(shellPid)])
      for (const line of stdout.split(/\r?\n/g)) {
        const pid = Number.parseInt(line.trim(), 10)
        if (!Number.isFinite(pid)) {
          continue
        }

        try {
          process.kill(pid, 'SIGTERM')
        } catch {
          // Ignore child shutdown races.
        }
      }
    } catch {
      // Ignore when the shell currently has no children.
    }
  }
}

function normalizeRunOptions(options: RunOptions) {
  if (typeof options === 'string') {
    return {
      workspaceDir: options,
      cwd: options,
    }
  }

  return {
    workspaceDir: options.workspaceDir,
    cwd: options.cwd,
  }
}

export function createProcessManager() {
  const servers = new Map<string, ManagedServer>()
  const shells = new Map<string, PersistentShellSession>()

  function getOrCreateShell(projectId: string, workspaceDir: string) {
    const existing = shells.get(projectId)
    if (existing?.alive) {
      return existing
    }

    const nextShell = new PersistentShellSession(workspaceDir)
    shells.set(projectId, nextShell)
    return nextShell
  }

  async function stopProjectServer(projectId: string) {
    const existingServer = servers.get(projectId)
    if (!existingServer) {
      return
    }

    killProcessTree(existingServer.process)
    servers.delete(projectId)
  }

  return {
    async run(projectId: string, command: string, options: RunOptions) {
      const { workspaceDir, cwd } = normalizeRunOptions(options)

      if (looksLikeServerCommand(command)) {
        await stopProjectServer(projectId)

        const shell = getOrCreateShell(projectId, workspaceDir)
        const effectiveCwd = cwd ?? shell.currentCwd ?? workspaceDir
        const port = await getAvailablePort()
        const previewUrl = `http://127.0.0.1:${port}`
        const startedAt = Date.now()
        const child = spawn('/bin/sh', ['-lc', command], {
          cwd: effectiveCwd,
          detached: true,
          env: {
            ...shell.currentEnv,
            PORT: String(port),
            HOST: '127.0.0.1',
            npm_config_port: String(port),
            ATOMS_PREVIEW_BASE_PATH: buildPreviewProxyBasePath(projectId),
            BROWSER: 'none',
            CI: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        const getOutput = collectOutput(child)

        child.unref()
        shell.setCurrentCwd(effectiveCwd)

        try {
          await waitForPort(port, SERVER_READY_TIMEOUT_MS)
        } catch (error) {
          killProcessTree(child)
          await sleep(100)
          const { stdout, stderr } = getOutput()
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
          cwd: effectiveCwd,
          exitCode: 0,
          output: [stdout, stderr].filter((entry) => entry.trim().length > 0).join('\n').trim(),
          durationMs,
          logs,
          previewUrl,
        } satisfies CommandResult
      }

      const shell = getOrCreateShell(projectId, workspaceDir)
      const startedAt = Date.now()
      const output = await shell.exec(command, cwd)
      const logs = [
        ...splitLines(output.stdout, 'stdout'),
        ...splitLines(output.stderr, 'stderr'),
      ]

      if (logs.length === 0 && output.exitCode !== 0) {
        logs.push({
          stream: 'stderr',
          text: `Command exited with code ${output.exitCode}`,
        })
      }

      return {
        command,
        cwd: output.cwd,
        exitCode: output.exitCode,
        output: [output.stdout, output.stderr].filter((entry) => entry.trim().length > 0).join('\n').trim(),
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
    async dispose(projectId: string) {
      await stopProjectServer(projectId)
      const shell = shells.get(projectId)
      if (!shell) {
        return
      }

      await shell.close()
      shells.delete(projectId)
    },
  }
}

export const processManager = createProcessManager()
