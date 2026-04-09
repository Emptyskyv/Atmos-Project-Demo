'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { TimelineItem } from '@/src/frontend/hooks/useWorkspaceState'
import type { ToolCallRequest, ToolResultPayload } from '@/src/shared/agent/tools/serializers'

type UseRunStreamArgs = {
  projectId: string
  activeRunId?: string | null
  setItems: Dispatch<SetStateAction<TimelineItem[]>>
  onToolResult?: (args: { call: ToolCallRequest; result: ToolResultPayload }) => void
}

type AssistantCompletedEvent = {
  message?: {
    id?: string
    text?: string
  }
}

type ToolCallCompletedEvent = {
  toolCall?: {
    runId?: string
    name?: string
    input?: Record<string, unknown>
  }
  result?: ToolResultPayload
  toolLog?: {
    toolCallId?: string
    summary?: string
    logs?: string[]
  }
}

type RunFailedEvent = {
  error?: {
    message?: string
  }
}

function isAssistantItem(item: TimelineItem): item is Extract<TimelineItem, { role: 'assistant' }> {
  return item.role === 'assistant'
}

function toolLogId(toolCallId: string) {
  return `tool-log-${toolCallId}`
}

export default function useRunStream({
  projectId,
  activeRunId = null,
  setItems,
  onToolResult,
}: UseRunStreamArgs) {
  const [isRunning, setIsRunning] = useState(false)
  const sourceRef = useRef<EventSource | null>(null)
  const activeRunIdRef = useRef<string | null>(null)

  const upsertToolLog = useCallback((toolCallId: string, summary: string, logs: string[] = []) => {
    setItems((previousItems) => {
      const existingIndex = previousItems.findIndex(
        (item) => item.role === 'tool_log' && item.id === toolLogId(toolCallId),
      )

      if (existingIndex === -1) {
        return [
          ...previousItems,
          {
            id: toolLogId(toolCallId),
            role: 'tool_log',
            summary,
            logs,
          },
        ]
      }

      const nextItems = [...previousItems]
      nextItems[existingIndex] = {
        id: toolLogId(toolCallId),
        role: 'tool_log',
        summary,
        logs: logs.length > 0 ? logs : previousItems[existingIndex]?.role === 'tool_log'
          ? previousItems[existingIndex].logs
          : [],
      }
      return nextItems
    })
  }, [setItems])

  const appendToolLog = useCallback((summary: string, logs: string[] = []) => {
    setItems((previousItems) => [
      ...previousItems,
      {
        id: `tool-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: 'tool_log',
        summary,
        logs,
      },
    ])
  }, [setItems])

  const setAssistantMessage = useCallback((messageId: string, content: string) => {
    setItems((previousItems) => {
      const existingIndex = previousItems.findIndex(
        (item) => item.role === 'assistant' && item.id === messageId,
      )

      if (existingIndex === -1) {
        return [...previousItems, { id: messageId, role: 'assistant', content }]
      }

      const nextItems = [...previousItems]
      const currentItem = nextItems[existingIndex]

      if (!currentItem || !isAssistantItem(currentItem)) {
        return previousItems
      }

      nextItems[existingIndex] = {
        id: currentItem.id,
        role: 'assistant',
        content,
      }
      return nextItems
    })
  }, [setItems])

  const openStream = useCallback((runId: string, streamUrl: string) => {
    sourceRef.current?.close()
    const source = new EventSource(streamUrl)
    sourceRef.current = source
    activeRunIdRef.current = runId
    setIsRunning(true)

    const closeStream = () => {
      source.close()
      if (sourceRef.current === source) {
        sourceRef.current = null
      }
    }

    source.addEventListener('assistant_message_delta', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        messageId?: string
        delta?: string
      }
      const messageId = payload.messageId

      if (!messageId) {
        return
      }

      setItems((previousItems) => {
        const existingIndex = previousItems.findIndex(
          (item) => item.role === 'assistant' && item.id === messageId,
        )
        if (existingIndex === -1) {
          return [
            ...previousItems,
            {
              id: messageId,
              role: 'assistant',
              content: payload.delta ?? '',
            },
          ]
        }

        const nextItems = [...previousItems]
        const current = nextItems[existingIndex]

        if (!current || !isAssistantItem(current)) {
          return previousItems
        }

        nextItems[existingIndex] = {
          id: current.id,
          role: 'assistant',
          content: `${current.content}${payload.delta ?? ''}`,
        }
        return nextItems
      })
    })

    source.addEventListener('assistant_message_completed', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as AssistantCompletedEvent
      const messageId = payload.message?.id
      if (!messageId) {
        return
      }
      setAssistantMessage(messageId, payload.message?.text ?? '')
    })

    source.addEventListener('tool_call_completed', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as ToolCallCompletedEvent
      const toolCallId = payload.toolLog?.toolCallId

      if (!toolCallId || !payload.toolLog?.summary) {
        return
      }

      upsertToolLog(toolCallId, payload.toolLog.summary, payload.toolLog.logs ?? [])

      const toolName = payload.toolCall?.name
      const toolInput = payload.toolCall?.input
      const completedRunId = payload.toolCall?.runId ?? runId

      if (toolName && toolInput && payload.result) {
        onToolResult?.({
          call: {
            toolCallId,
            runId: completedRunId,
            name: toolName as ToolCallRequest['name'],
            input: toolInput,
          },
          result: payload.result,
        })
      }
    })

    source.addEventListener('run_completed', () => {
      setIsRunning(false)
      closeStream()
    })

    source.addEventListener('run_failed', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as RunFailedEvent
      appendToolLog('run failed', [
        payload.error?.message ?? '[error] Run failed. Check backend logs for details.',
      ])
      setIsRunning(false)
      closeStream()
    })

    source.onerror = () => {
      closeStream()
      setIsRunning(false)
    }
  }, [appendToolLog, onToolResult, setAssistantMessage, setItems, upsertToolLog])

  const startRun = async (prompt: string) => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || isRunning) {
      return
    }

    setIsRunning(true)

    try {
      const response = await fetch(`/api/projects/${projectId}/runs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userMessage: {
            text: trimmedPrompt,
          },
        }),
      })

      if (!response.ok) {
        setIsRunning(false)
        appendToolLog('run create failed', ['[error] Failed to create run.'])
        return
      }

      const body = (await response.json()) as {
        run?: {
          id?: string
        }
        streamUrl?: string
      }
      const runId = body.run?.id
      if (!runId) {
        setIsRunning(false)
        appendToolLog('run create failed', ['[error] Missing run id in response.'])
        return
      }

      setItems((previousItems) => [
        ...previousItems,
        {
          id: `${runId}-user`,
          role: 'user',
          content: trimmedPrompt,
        },
      ])

      openStream(runId, body.streamUrl ?? `/api/runs/${runId}/stream`)
    } catch {
      setIsRunning(false)
      appendToolLog('run create failed', ['[error] Network failure while creating run.'])
    }
  }

  useEffect(() => {
    if (!activeRunId) {
      return
    }
    if (activeRunIdRef.current === activeRunId && sourceRef.current) {
      return
    }
    openStream(activeRunId, `/api/runs/${activeRunId}/stream`)
  }, [activeRunId, openStream])

  useEffect(() => {
    return () => {
      sourceRef.current?.close()
      sourceRef.current = null
    }
  }, [])

  return {
    isRunning,
    startRun,
  }
}
