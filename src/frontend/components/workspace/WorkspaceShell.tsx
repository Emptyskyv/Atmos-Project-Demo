'use client'

import { useEffect, useRef, useState } from 'react'
import ChatPanel from '@/src/frontend/components/workspace/ChatPanel'
import CodePanel from '@/src/frontend/components/workspace/CodePanel'
import FileTree from '@/src/frontend/components/workspace/FileTree'
import PreviewPanel from '@/src/frontend/components/workspace/PreviewPanel'
import PublishDialog from '@/src/frontend/components/workspace/PublishDialog'
import TerminalPanel from '@/src/frontend/components/workspace/TerminalPanel'
import useRunStream from '@/src/frontend/hooks/useRunStream'
import type { TimelineItem } from '@/src/frontend/hooks/useWorkspaceState'
import useWorkspaceState from '@/src/frontend/hooks/useWorkspaceState'
import { toTarGzBlob } from '@/src/frontend/workspace/tarball'

type WorkspaceShellProps = {
  projectId: string
}

export default function WorkspaceShell({ projectId }: WorkspaceShellProps) {
  const [prompt, setPrompt] = useState('Continue with the next workspace step.')
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishedPreviewUrl, setPublishedPreviewUrl] = useState<string | null>(null)
  const publishSourceRef = useRef<EventSource | null>(null)
  const {
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
  } = useWorkspaceState(projectId)
  const { isRunning, startRun } = useRunStream({
    projectId,
    activeRunId,
    setItems,
    onToolResult: applyToolResult,
  })

  function pushTimelineItem(item: TimelineItem) {
    setItems((previousItems) => [...previousItems, item])
  }

  function pushPublishLog(summary: string, logs: string[] = []) {
    pushTimelineItem({
      id: `publish-log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role: 'tool_log',
      summary,
      logs,
    })
  }

  function closePublishStream() {
    publishSourceRef.current?.close()
    publishSourceRef.current = null
  }

  function handlePublishUpdate(event: MessageEvent<string>) {
    const payload = JSON.parse(event.data) as {
      publishJob?: {
        id?: string
        status?: string
        deployedUrl?: string | null
        lastError?: unknown
      }
    }
    const publishJob = payload.publishJob

    if (!publishJob?.id || !publishJob.status) {
      return
    }

    const status = publishJob.status
    const deployUrl = typeof publishJob.deployedUrl === 'string' ? publishJob.deployedUrl : null
    const errorDetails = publishJob.lastError
    const logs =
      status === 'error'
        ? [
            `[error] ${
              typeof errorDetails === 'string'
                ? errorDetails
                : errorDetails && typeof errorDetails === 'object' && 'message' in errorDetails
                  ? String(errorDetails.message)
                  : 'Publish failed'
            }`,
          ]
        : [`[info] status=${status}`]

    pushPublishLog(`publish ${status}`, logs)

    if (deployUrl) {
      setPublishedPreviewUrl(deployUrl)
    }

    if (status === 'ready' || status === 'error') {
      setIsPublishing(false)
      closePublishStream()
    }
  }

  async function handlePublish() {
    if (isPublishing) {
      return
    }

    if (files.length === 0) {
      pushPublishLog('publish skipped', ['[error] No workspace files to snapshot.'])
      return
    }

    setIsPublishing(true)
    pushTimelineItem({
      id: `assistant-publish-${Date.now()}`,
      role: 'assistant',
      content: 'Preparing snapshot and starting publish...',
    })

    try {
      const snapshotBlob = toTarGzBlob(files)
      const formData = new FormData()
      formData.set(
        'file',
        new File([snapshotBlob], 'snapshot.tar.gz', {
          type: 'application/gzip',
        }),
      )
      formData.set('summary', `Workspace publish snapshot (${new Date().toISOString()})`)

      const snapshotResponse = await fetch(`/api/projects/${projectId}/snapshots`, {
        method: 'POST',
        body: formData,
      })
      if (!snapshotResponse.ok) {
        throw new Error('Failed to create snapshot')
      }

      const snapshotBody = (await snapshotResponse.json()) as {
        snapshot?: {
          id?: string
        }
      }
      const snapshotId = snapshotBody.snapshot?.id
      if (!snapshotId) {
        throw new Error('Missing snapshot id')
      }
      pushPublishLog('snapshot created', [`[info] snapshotId=${snapshotId}`])

      const publishResponse = await fetch(`/api/projects/${projectId}/publish`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          snapshotId,
        }),
      })
      if (!publishResponse.ok) {
        throw new Error('Failed to start publish')
      }

      const publishBody = (await publishResponse.json()) as {
        publishJob?: {
          id?: string
          status?: string
          deployedUrl?: string | null
        }
        streamUrl?: string
      }
      const publishJob = publishBody.publishJob
      if (!publishJob?.id) {
        throw new Error('Missing publish job id')
      }

      pushPublishLog(`publish ${publishJob.status ?? 'queued'}`, ['[info] publish queued'])
      if (publishJob.deployedUrl) {
        setPublishedPreviewUrl(publishJob.deployedUrl)
      }

      closePublishStream()
      const source = new EventSource(publishBody.streamUrl ?? `/api/publish/${publishJob.id}/stream`)
      publishSourceRef.current = source
      source.addEventListener('publish_updated', handlePublishUpdate as EventListener)
      source.onerror = () => {
        pushPublishLog('publish stream error', ['[error] Publish stream disconnected.'])
        setIsPublishing(false)
        closePublishStream()
      }
    } catch (error) {
      pushPublishLog('publish failed', [
        error instanceof Error ? `[error] ${error.message}` : '[error] Unexpected publish failure.',
      ])
      setIsPublishing(false)
      closePublishStream()
    }
  }

  useEffect(() => {
    return () => {
      closePublishStream()
    }
  }, [])

  const effectivePreviewUrl = publishedPreviewUrl ?? previewUrl

  return (
    <main className="workspace-surface min-h-screen p-4 md:p-5">
      <div className="grid min-h-[calc(100vh-2rem)] grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_368px]">
        <FileTree
          projectName={projectName}
          files={files}
          activeFilePath={activeFilePath}
          selectFile={selectFile}
        />

        <section className="workspace-panel flex min-h-0 flex-col gap-3 rounded-2xl border shadow-[0_10px_32px_rgb(34_32_28/7%)]">
          <header className="flex items-center justify-between rounded-t-2xl border-b border-[var(--border)] bg-[color:rgb(255_255_255/55%)] px-4 py-3 backdrop-blur-sm">
            <div>
              <p className="workspace-kicker">Workspace</p>
              <h1 className="text-lg font-semibold text-[var(--foreground)]">{projectName}</h1>
              <p className="text-sm text-[var(--muted)]">Chat-driven runtime workspace (MVP)</p>
            </div>
            <div className="flex items-center gap-2">
              <PublishDialog onPublish={handlePublish} isPublishing={isPublishing} />
              <button
                type="button"
                onClick={() => {
                  void startRun(prompt)
                }}
                className="rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--surface-strong)] transition-colors hover:bg-black"
              >
                {isRunning ? 'Running…' : 'Run'}
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1 px-3 pb-3 md:px-4 md:pb-4">
            <ChatPanel items={items} />
          </div>
          <div className="border-t border-[var(--border)] px-3 pb-3 pt-3 md:px-4 md:pb-4">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void startRun(prompt)
              }}
              className="flex gap-2"
            >
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe what to build next..."
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={isRunning || !prompt.trim()}
                className="rounded-xl bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--surface-strong)] transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send
              </button>
            </form>
          </div>
        </section>

        <section className="grid min-h-0 gap-3 md:grid-cols-3 xl:grid-cols-1 xl:grid-rows-3">
          <CodePanel activeFilePath={activeFilePath} activeFileContents={activeFileContents} />
          <TerminalPanel terminalLines={terminalLines} />
          <PreviewPanel previewUrl={effectivePreviewUrl} />
        </section>
      </div>
    </main>
  )
}
