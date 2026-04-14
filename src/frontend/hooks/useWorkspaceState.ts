'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { ToolCallRequest, ToolResultPayload } from '@/src/shared/agent/tools/serializers'

type UserTimelineItem = {
  id: string
  role: 'user'
  content: string
}

type AssistantTimelineItem = {
  id: string
  role: 'assistant'
  content: string
}

type ToolLogTimelineItem = {
  id: string
  role: 'tool_log'
  summary: string
  logs?: string[]
}

export type TimelineItem = UserTimelineItem | AssistantTimelineItem | ToolLogTimelineItem

export type WorkspaceFile = {
  path: string
  contents: string
}

type ApplyToolResultArgs = {
  call: ToolCallRequest
  result: ToolResultPayload
}

type PersistedMessageItem = {
  id: string
  kind: string
  text?: string
  summary?: string
  logs?: string[]
  toolName?: string
  output?: unknown
}

function formatTerminalExitLine(exitCode: number, durationMs?: number) {
  if (typeof durationMs === 'number') {
    return `[exit ${exitCode}] completed in ${(durationMs / 1000).toFixed(1)}s`
  }

  return `[exit ${exitCode}] completed`
}

function toTerminalLinesFromBashResult({
  command,
  cwd,
  exitCode,
  durationMs,
  logs,
}: {
  command: string
  cwd?: string | null
  exitCode: number
  durationMs?: number
  logs?: ToolResultPayload['logs']
}) {
  return [
    ...(cwd ? [`[cwd] ${cwd}`] : []),
    `$ ${command}`,
    ...(
      logs && logs.length > 0
        ? logs.map((line) => `[${line.stream}] ${line.text}`)
        : ['[info] Command completed with no output.']
    ),
    formatTerminalExitLine(exitCode, durationMs),
  ]
}

function toTerminalLinesFromPersistedToolLog(item: PersistedMessageItem) {
  if (item.kind !== 'tool_log' || item.toolName !== 'bash') {
    return []
  }

  const output = item.output && typeof item.output === 'object'
    ? (item.output as { command?: unknown; cwd?: unknown; exitCode?: unknown })
    : null
  const command = typeof output?.command === 'string' ? output.command : 'bash'
  const cwd = typeof output?.cwd === 'string' ? output.cwd : null
  const exitCode = typeof output?.exitCode === 'number' ? output.exitCode : 0
  const logs = Array.isArray(item.logs) && item.logs.length > 0
    ? item.logs
    : ['[info] Command completed with no output.']

  return [
    ...(cwd ? [`[cwd] ${cwd}`] : []),
    `$ ${command}`,
    ...logs,
    formatTerminalExitLine(exitCode),
  ]
}

type WorkspaceState = {
  projectName: string
  items: TimelineItem[]
  setItems: Dispatch<SetStateAction<TimelineItem[]>>
  activeRunId: string | null
  files: WorkspaceFile[]
  activeFilePath: string | null
  activeFileContents: string
  terminalLines: string[]
  previewUrl: string | null
  selectFile: (path: string) => void
  applyToolResult: (args: ApplyToolResultArgs) => void
}

export default function useWorkspaceState(projectId: string): WorkspaceState {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [projectName, setProjectName] = useState(`Project ${projectId}`)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [terminalLines, setTerminalLines] = useState<string[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const activeFileContents = useMemo(() => {
    if (!activeFilePath) {
      return ''
    }

    return files.find((file) => file.path === activeFilePath)?.contents ?? ''
  }, [activeFilePath, files])

  function selectFile(path: string) {
    setActiveFilePath(path)
  }

  function upsertFiles(nextFiles: WorkspaceFile[]) {
    if (nextFiles.length === 0) {
      return
    }

    setFiles((previousFiles) => {
      const filesByPath = new Map(previousFiles.map((file) => [file.path, file]))

      for (const file of nextFiles) {
        filesByPath.set(file.path, file)
      }

      return [...filesByPath.values()].sort((left, right) => left.path.localeCompare(right.path))
    })
  }

  function applyToolResult({ call, result }: ApplyToolResultArgs) {
    const writtenPath = typeof call.input.path === 'string' ? call.input.path : null
    const writtenContents =
      typeof call.input.content === 'string'
        ? call.input.content
        : typeof call.input.contents === 'string'
          ? call.input.contents
          : null

    if (Array.isArray(result.updatedFiles) && result.updatedFiles.length > 0) {
      upsertFiles(result.updatedFiles)
      setActiveFilePath(result.updatedFiles[0]?.path ?? null)
    }

    if (call.name === 'write' && writtenPath && writtenContents !== null) {
      upsertFiles([{ path: writtenPath, contents: writtenContents }])
      setActiveFilePath(writtenPath)
    } else if (result.filesChanged?.length) {
      setFiles((previousFiles) => {
        const nextFiles = [...previousFiles]

        for (const path of result.filesChanged ?? []) {
          if (!nextFiles.some((file) => file.path === path)) {
            nextFiles.push({ path, contents: '' })
          }
        }

        return nextFiles
      })
    }

    if (call.name === 'bash') {
      const output = result.output && typeof result.output === 'object'
        ? (result.output as { command?: unknown; cwd?: unknown; exitCode?: unknown })
        : null
      const command = typeof output?.command === 'string'
        ? output.command
        : typeof call.input.command === 'string'
          ? call.input.command
          : 'bash'
      const cwd = typeof output?.cwd === 'string'
        ? output.cwd
        : typeof call.input.cwd === 'string'
          ? call.input.cwd
          : null
      const exitCode = typeof output?.exitCode === 'number' ? output.exitCode : result.isError ? 1 : 0
      const nextTerminalLines = toTerminalLinesFromBashResult({
        command,
        cwd,
        exitCode,
        durationMs: result.durationMs,
        logs: result.logs,
      })

      setTerminalLines((previousLines) => [
        ...previousLines,
        ...(previousLines.length > 0 ? [''] : []),
        ...nextTerminalLines,
      ])
    }

    if (result.previewUrl !== undefined) {
      setPreviewUrl(result.previewUrl ?? null)
    }
  }

  useEffect(() => {
    let isCancelled = false

    if (projectId === 'demo') {
      setProjectName('Demo project')
      setFiles([
        {
          path: 'app/page.tsx',
          contents: 'export default function Page() { return <main>Demo workspace</main> }',
        },
      ])
      setActiveFilePath('app/page.tsx')
      setTerminalLines(['Workspace demo loaded.'])
      setPreviewUrl(null)
      setItems([
        { id: 'seed-user', role: 'user', content: 'Create a focused MVP workspace shell.' },
        { id: 'seed-assistant', role: 'assistant', content: 'Workspace shell is ready for iteration.' },
        {
          id: 'seed-tool',
          role: 'tool_log',
          summary: 'write app/page.tsx',
          logs: ['[info] initialized runtime placeholders'],
        },
      ])
      setActiveRunId(null)
      return () => {
        isCancelled = true
      }
    }

    const load = async () => {
      try {
        const [projectResponse, messagesResponse] = await Promise.all([
          fetch(`/api/projects/${projectId}`, {
            method: 'GET',
          }),
          fetch(`/api/projects/${projectId}/messages?limit=100`, {
            method: 'GET',
          }),
        ])

        if (!projectResponse.ok || !messagesResponse.ok) {
          return
        }

        const projectBody = (await projectResponse.json()) as {
          project?: { name?: string; deployedUrl?: string | null }
          latestRun?: { id?: string; status?: string } | null
          workspace?: {
            files?: WorkspaceFile[]
            previewUrl?: string | null
          }
        }
        const messagesBody = (await messagesResponse.json()) as {
          items?: PersistedMessageItem[]
        }

        if (isCancelled) {
          return
        }

        setProjectName(projectBody.project?.name ?? `Project ${projectId}`)
        const workspaceFiles = Array.isArray(projectBody.workspace?.files)
          ? [...projectBody.workspace.files].sort((left, right) => left.path.localeCompare(right.path))
          : []
        setFiles(workspaceFiles)
        setActiveFilePath(workspaceFiles[0]?.path ?? null)
        const messageItems = messagesBody.items ?? []
        setTerminalLines(
          messageItems.flatMap((item) => toTerminalLinesFromPersistedToolLog(item)),
        )
        setPreviewUrl(projectBody.workspace?.previewUrl ?? projectBody.project?.deployedUrl ?? null)
        setItems(
          messageItems
            .flatMap<TimelineItem>((item) => {
              if (item.kind === 'user' || item.kind === 'assistant') {
                return [
                  {
                    id: item.id,
                    role: item.kind as 'user' | 'assistant',
                    content: item.text ?? '',
                  },
                ]
              }

              if (item.kind === 'tool_log') {
                return [
                  {
                    id: item.id,
                    role: 'tool_log' as const,
                    summary: item.summary ?? '',
                    logs: Array.isArray(item.logs) ? item.logs : [],
                  },
                ]
              }

              return []
            }),
        )

        const latestRun = projectBody.latestRun
        if (latestRun?.id && ['queued', 'running', 'waiting_for_tool'].includes(latestRun.status ?? '')) {
          setActiveRunId(latestRun.id)
        } else {
          setActiveRunId(null)
        }
      } catch {
        if (!isCancelled) {
          setActiveRunId(null)
        }
      }
    }

    void load()

    return () => {
      isCancelled = true
    }
  }, [projectId])

  return {
    projectName,
    items,
    setItems,
    activeRunId,
    files,
    activeFilePath,
    activeFileContents,
    terminalLines,
    previewUrl,
    selectFile,
    applyToolResult,
  }
}
