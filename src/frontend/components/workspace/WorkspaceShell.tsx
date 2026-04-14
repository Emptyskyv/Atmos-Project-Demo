'use client'

import { useEffect, useRef, useState } from 'react'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import ChatPanel from '@/src/frontend/components/workspace/ChatPanel'
import CodePanel from '@/src/frontend/components/workspace/CodePanel'
import FileTree from '@/src/frontend/components/workspace/FileTree'
import PreviewPanel from '@/src/frontend/components/workspace/PreviewPanel'
import PublishDialog from '@/src/frontend/components/workspace/PublishDialog'
import TerminalPanel from '@/src/frontend/components/workspace/TerminalPanel'
import SignOutButton from '@/src/frontend/components/auth/SignOutButton'
import Link from 'next/link'
import useRunStream from '@/src/frontend/hooks/useRunStream'
import type { TimelineItem } from '@/src/frontend/hooks/useWorkspaceState'
import useWorkspaceState from '@/src/frontend/hooks/useWorkspaceState'
import { toTarGzBlob } from '@/src/frontend/workspace/tarball'

type WorkspaceShellProps = {
  projectId: string
}

export default function WorkspaceShell({ projectId }: WorkspaceShellProps) {
  const [prompt, setPrompt] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishedPreviewUrl, setPublishedPreviewUrl] = useState<string | null>(null)
  const [showCode, setShowCode] = useState(true)
  const [showTerminal, setShowTerminal] = useState(true)
  const [showPreview, setShowPreview] = useState(true)
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
      setShowPreview(true)
    }

    if (status === 'ready' && deployUrl) {
      pushTimelineItem({
        id: `assistant-publish-ready-${Date.now()}`,
        role: 'assistant',
        content: `Published live: ${deployUrl}`,
      })
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
        setShowPreview(true)
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

  function ResizeHandle({ direction = 'horizontal' }: { direction?: 'horizontal' | 'vertical' }) {
    return (
      <PanelResizeHandle className={`flex items-center justify-center transition-colors hover:bg-[var(--accent)] active:bg-[var(--accent)] ${direction === 'horizontal' ? 'w-2 mx-1 cursor-col-resize' : 'h-2 my-1 cursor-row-resize'}`}>
        <div className={`rounded-full bg-[var(--border)] ${direction === 'horizontal' ? 'h-8 w-1' : 'w-8 h-1'}`} />
      </PanelResizeHandle>
    )
  }

  const effectivePreviewUrl = publishedPreviewUrl ?? previewUrl

  return (
    <main className="workspace-surface flex h-screen min-h-0 flex-col p-4 md:p-5">
      <header className="mb-4 flex shrink-0 items-center justify-between rounded-xl border border-[var(--border)] bg-[color:rgb(255_255_255/55%)] px-4 py-3 backdrop-blur-sm">
        <div>
          <p className="workspace-kicker">Workspace</p>
          <h1 className="text-lg font-semibold text-[var(--foreground)]">{projectName}</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 text-sm font-medium shadow-sm">
            <button type="button" onClick={() => setShowCode(!showCode)} className={`px-3 py-1 rounded-md transition-colors ${showCode ? 'bg-[var(--foreground)] text-[var(--surface-strong)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}>Code</button>
            <button type="button" onClick={() => setShowTerminal(!showTerminal)} className={`px-3 py-1 rounded-md transition-colors ${showTerminal ? 'bg-[var(--foreground)] text-[var(--surface-strong)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}>Terminal</button>
            <button type="button" onClick={() => setShowPreview(!showPreview)} className={`px-3 py-1 rounded-md transition-colors ${showPreview ? 'bg-[var(--foreground)] text-[var(--surface-strong)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}>Preview</button>
          </div>
          <div className="h-6 w-px bg-[var(--border)]" />
          <Link href="/dashboard" className="text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:underline transition-colors" title="Return to Dashboard">Dashboard</Link>
          <SignOutButton />
          <div className="h-4 w-px bg-[var(--border)]" />
          <PublishDialog onPublish={handlePublish} isPublishing={isPublishing} />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <PanelGroup orientation="horizontal">
          <Panel defaultSize={35} minSize={20} className="flex min-h-0">
            <section className="workspace-panel flex h-full min-h-0 w-full flex-1 flex-col gap-3 rounded-2xl border shadow-[0_10px_32px_rgb(34_32_28/7%)]">
              <div className="min-h-0 flex-1 px-3 py-3 md:px-4 md:pt-4">
                <ChatPanel items={items} />
              </div>
              <div className="border-t border-[var(--border)] px-3 pb-3 pt-3 md:px-4 md:pb-4">
                <form onSubmit={(event) => { event.preventDefault(); void startRun(prompt); setPrompt(''); }} className="flex gap-2">
                  <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe what to build next..." className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)]" />
                  <button type="submit" disabled={isRunning || !prompt.trim()} className="rounded-xl bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--surface-strong)] transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-60">Send</button>
                </form>
              </div>
            </section>
          </Panel>

          <ResizeHandle direction="horizontal" />

          <Panel defaultSize={20} minSize={15} className="flex min-h-0">
            <div className="h-full min-h-0 w-full [&>section]:h-full [&>section]:w-full">
              <FileTree projectName={projectName} files={files} activeFilePath={activeFilePath} selectFile={selectFile} />
            </div>
          </Panel>

          {(showCode || showTerminal || showPreview) && (
            <>
              <ResizeHandle direction="horizontal" />
              <Panel defaultSize={45} minSize={20} className="flex min-h-0">
                <PanelGroup orientation="vertical">
                  {showCode && (
                    <>
                      <Panel minSize={20} className="flex min-h-0">
                        <div className="h-full min-h-0 w-full [&>section]:h-full [&>section]:w-full">
                          <CodePanel activeFilePath={activeFilePath} activeFileContents={activeFileContents} />
                        </div>
                      </Panel>
                      {(showTerminal || showPreview) && <ResizeHandle direction="vertical" />}
                    </>
                  )}
                  {showTerminal && (
                    <>
                      <Panel minSize={20} className="flex min-h-0">
                        <div className="h-full min-h-0 w-full [&>section]:h-full [&>section]:w-full">
                          <TerminalPanel terminalLines={terminalLines} />
                        </div>
                      </Panel>
                      {showPreview && <ResizeHandle direction="vertical" />}
                    </>
                  )}
                  {showPreview && (
                    <Panel minSize={20} className="flex min-h-0">
                      <div className="h-full min-h-0 w-full [&>section]:h-full [&>section]:w-full">
                        <PreviewPanel previewUrl={effectivePreviewUrl} publishedUrl={publishedPreviewUrl} />
                      </div>
                    </Panel>
                  )}
                </PanelGroup>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </main>
  )
}
