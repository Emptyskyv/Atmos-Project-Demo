import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { createOpenAiRuntime, type AgentRuntime } from '@/src/backend/agent/runtime'
import { toolExecutor as defaultToolExecutor, type ToolExecutor } from '@/src/backend/agent/tool-executor'
import type { ToolCallRequest, ToolResultPayload } from '@/src/shared/agent/tools/serializers'
import { serverEnv } from '@/src/backend/platform/env'
import { requireAuth } from '@/src/backend/api/context'

const createRunSchema = z.object({
  userMessage: z.object({
    text: z.string().min(1),
  }),
  baseSnapshotId: z.string().nullable().optional(),
  clientState: z
    .object({
      activeFile: z.string().nullable().optional(),
      openFiles: z.array(z.string()).optional(),
      previewUrl: z.string().nullable().optional(),
    })
    .optional(),
})

const toolResultSchema = z.object({
  toolCallId: z.string().min(1),
  output: z.unknown(),
  isError: z.boolean().optional(),
  durationMs: z.number().optional(),
  filesChanged: z.array(z.string()).optional(),
  previewUrl: z.string().nullable().optional(),
  logs: z
    .array(
      z.object({
        ts: z.string(),
        stream: z.enum(['stdout', 'stderr', 'info']),
        text: z.string(),
      }),
    )
    .optional(),
  clientSequence: z.number().int().nonnegative(),
})

type RunRouteDeps = {
  runtime?: AgentRuntime
  hasActiveRun?: (projectId: string) => boolean
  toolExecutor?: ToolExecutor
}

function buildSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function buildToolLogItem(toolCall: {
  toolCallId: string
  name: string
  input: Record<string, unknown>
  output: unknown
  isError: boolean
  logs?: string[]
}) {
  return {
    kind: 'tool_log',
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.name,
    status: toolCall.isError ? 'failed' : 'succeeded',
    summary: `${toolCall.name} ${JSON.stringify(toolCall.input)}`,
    output: toolCall.output,
    collapsedByDefault: true,
    logs: toolCall.logs ?? [],
  }
}

async function loadRunInputText(
  repository: {
    listMessages: (projectId: string, limit: number, beforeId?: string) => Promise<
      Array<{ runId: string | null; kind: string; payload: Record<string, unknown> }>
    >
  },
  projectId: string,
  runId: string,
) {
  const messages = await repository.listMessages(projectId, 200)
  const userMessage = messages
    .filter((message) => message.runId === runId && message.kind === 'user')
    .at(-1)

  return typeof userMessage?.payload.text === 'string' ? userMessage.payload.text : null
}

function toToolLogLines(result: Pick<ToolResultPayload, 'logs'>) {
  return result.logs?.map((line) => line.text) ?? []
}

export function buildRunRoutes(deps: RunRouteDeps = {}) {
  let resolvedRuntime = deps.runtime
  const resolvedToolExecutor = deps.toolExecutor ?? defaultToolExecutor

  function getRuntime() {
    if (!resolvedRuntime) {
      resolvedRuntime = createOpenAiRuntime()
    }

    return resolvedRuntime
  }

  return new Hono()
    .use('*', requireAuth)
    .post('/projects/:projectId/runs', zValidator('json', createRunSchema), async (c) => {
      const projectId = c.req.param('projectId')
      const repository = c.get('repository')
      const project = await repository.getProjectById(c.get('currentUserId'), projectId)

      if (!project) {
        return c.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Project not found',
            },
          },
          404,
        )
      }

      const hasActiveRun = deps.hasActiveRun
        ? deps.hasActiveRun(projectId)
        : Boolean(await repository.getActiveRun(projectId))

      if (hasActiveRun) {
        return c.json(
          {
            error: {
              code: 'RUN_ALREADY_ACTIVE',
              message: 'Project already has an active run',
            },
          },
          409,
        )
      }

      const body = c.req.valid('json')
      const run = await repository.createRun({
        projectId,
        userId: c.get('currentUserId'),
        model: serverEnv.OPENAI_MODEL,
        status: 'queued',
      })

      await repository.createMessage({
        projectId,
        runId: run.id,
        kind: 'user',
        payload: {
          kind: 'user',
          text: body.userMessage.text,
        },
      })

      await repository.updateProject(projectId, {
        latestRunId: run.id,
        status: 'running',
      })

      return c.json(
        {
          run,
          streamUrl: `/api/runs/${run.id}/stream`,
        },
        201,
      )
    })
    .get('/runs/:runId', async (c) => {
      const repository = c.get('repository')
      const run = await repository.getRunById(c.req.param('runId'))

      if (!run || run.userId !== c.get('currentUserId')) {
        return c.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Run not found',
            },
          },
          404,
        )
      }

      const pendingToolCallRecord = run.waitingToolCallId
        ? await repository.getToolCallByCallId(run.waitingToolCallId)
        : null
      const pendingToolCall =
        run.status === 'waiting_for_tool' && pendingToolCallRecord?.clientSequence === null
          ? pendingToolCallRecord
          : null

      return c.json({
        run,
        pendingToolCall: pendingToolCall
          ? {
              toolCallId: pendingToolCall.toolCallId,
              runId: run.id,
              name: pendingToolCall.name,
              input: pendingToolCall.input,
            }
          : undefined,
      })
    })
    .post('/runs/:runId/tool-results', zValidator('json', toolResultSchema), async (c) => {
      const repository = c.get('repository')
      const run = await repository.getRunById(c.req.param('runId'))

      if (!run || run.userId !== c.get('currentUserId')) {
        return c.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Run not found',
            },
          },
          404,
        )
      }

      if (run.status !== 'waiting_for_tool' || !run.waitingToolCallId) {
        return c.json(
          {
            error: {
              code: 'RUN_NOT_ACTIVE',
              message: 'Run is not waiting for a tool result',
            },
          },
          409,
        )
      }

      const body = c.req.valid('json')
      const toolCall = await repository.getToolCallByCallId(body.toolCallId)

      if (!toolCall || toolCall.runId !== run.id || toolCall.toolCallId !== run.waitingToolCallId) {
        return c.json(
          {
            error: {
              code: 'TOOL_RESULT_CONFLICT',
              message: 'Tool result does not match the current pending tool call',
            },
          },
          409,
        )
      }

      if (toolCall.clientSequence !== null) {
        if (toolCall.clientSequence === body.clientSequence) {
          return c.json({ run }, 202)
        }

        return c.json(
          {
            error: {
              code: 'TOOL_RESULT_CONFLICT',
              message: 'Tool result sequence conflict',
            },
          },
          409,
        )
      }

      await repository.updateToolCall(toolCall.toolCallId, {
        output: body.output,
        isError: body.isError ?? false,
        clientSequence: body.clientSequence,
        status: body.isError ? 'failed_client' : 'completed_client',
      })

      const updatedRun = await repository.updateRun(run.id, {
        status: 'running',
      })
      await repository.updateProject(run.projectId, {
        status: 'running',
      })

      return c.json({ run: updatedRun }, 202)
    })
    .get('/runs/:runId/stream', async (c) => {
      const repository = c.get('repository')
      const existingRun = await repository.getRunById(c.req.param('runId'))

      if (!existingRun || existingRun.userId !== c.get('currentUserId')) {
        return c.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Run not found',
            },
          },
          404,
        )
      }

      const encoder = new TextEncoder()

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const push = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(buildSseEvent(event, data)))
          }
          let run = existingRun

          try {
            if (run.status === 'completed') {
              push('run_started', { run })
              push('run_completed', { run })
              controller.close()
              return
            }

            if (run.status === 'failed') {
              push('run_started', { run })
              push('run_failed', {
                runId: run.id,
                error: {
                  code: 'OPENAI_UPSTREAM_ERROR',
                  message:
                    typeof (run.lastError as { message?: unknown } | null)?.message === 'string'
                      ? ((run.lastError as { message?: string }).message ?? 'Run failed')
                      : 'Run failed',
                },
                run,
              })
              controller.close()
              return
            }

            if (run.status === 'cancelled') {
              push('run_started', { run })
              push('run_completed', { run })
              controller.close()
              return
            }

            if (run.status !== 'running' || !run.startedAt) {
              run = await repository.updateRun(run.id, {
                status: 'running',
                startedAt: run.startedAt ?? new Date().toISOString(),
              })
              await repository.updateProject(run.projectId, {
                status: 'running',
              })
            }

            push('run_started', { run })
            const failRun = async (message: string) => {
              run = await repository.updateRun(run.id, {
                status: 'failed',
                lastError: {
                  message,
                },
                finishedAt: new Date().toISOString(),
              })
              await repository.updateProject(run.projectId, {
                status: 'error',
              })
              push('run_failed', {
                runId: run.id,
                error: {
                  code: 'OPENAI_UPSTREAM_ERROR',
                  message,
                },
                run,
              })
              controller.close()
            }

            const existingToolCalls = await repository.listToolCallsForRun(run.id)
            let nextClientSequence =
              existingToolCalls.reduce((maxValue, toolCall) => {
                return Math.max(maxValue, toolCall.clientSequence ?? 0)
              }, 0) + 1

            const persistToolCompletion = async (
              toolCall: ToolCallRequest,
              result: Omit<ToolResultPayload, 'toolCallId' | 'clientSequence'>,
            ) => {
              const resultPayload: ToolResultPayload = {
                toolCallId: toolCall.toolCallId,
                output: result.output,
                isError: result.isError ?? false,
                durationMs: result.durationMs,
                filesChanged: result.filesChanged,
                updatedFiles: result.updatedFiles,
                previewUrl: result.previewUrl,
                logs: result.logs,
                clientSequence: nextClientSequence++,
              }

              await repository.updateToolCall(toolCall.toolCallId, {
                output: resultPayload.output,
                isError: resultPayload.isError ?? false,
                clientSequence: resultPayload.clientSequence,
                status: resultPayload.isError ? 'failed_server' : 'completed_server',
              })

              const toolLogItem = buildToolLogItem({
                toolCallId: toolCall.toolCallId,
                name: toolCall.name,
                input: toolCall.input,
                output: resultPayload.output,
                isError: resultPayload.isError ?? false,
                logs: toToolLogLines(resultPayload),
              })
              const persistedToolLog = await repository.createMessage({
                projectId: run.projectId,
                runId: run.id,
                kind: 'tool_log',
                payload: toolLogItem,
              })

              push('tool_call_completed', {
                runId: run.id,
                toolCall,
                result: resultPayload,
                toolLog: {
                  ...toolLogItem,
                  id: persistedToolLog.id,
                  projectId: persistedToolLog.projectId,
                  runId: persistedToolLog.runId,
                  createdAt: persistedToolLog.createdAt,
                },
              })

              return resultPayload
            }

            while (true) {
              if (run.waitingToolCallId) {
                const pendingToolCall = await repository.getToolCallByCallId(run.waitingToolCallId)

                if (pendingToolCall && pendingToolCall.clientSequence === null) {
                  const executionResult = await resolvedToolExecutor.execute({
                    repository,
                    run,
                    toolCall: {
                      toolCallId: pendingToolCall.toolCallId,
                      runId: run.id,
                      name: pendingToolCall.name as ToolCallRequest['name'],
                      input: pendingToolCall.input,
                    },
                  })

                  await persistToolCompletion(
                    {
                      toolCallId: pendingToolCall.toolCallId,
                      runId: run.id,
                      name: pendingToolCall.name as ToolCallRequest['name'],
                      input: pendingToolCall.input,
                    },
                    executionResult,
                  )

                  if (executionResult.fatal) {
                    await failRun(
                      typeof (executionResult.output as { message?: unknown } | null)?.message === 'string'
                        ? ((executionResult.output as { message?: string }).message ?? 'Tool execution failed')
                        : 'Tool execution failed',
                    )
                    return
                  }
                }

                run = await repository.updateRun(run.id, {
                  status: 'running',
                })
                await repository.updateProject(run.projectId, {
                  status: 'running',
                })
              }

              const inputText =
                run.serializedState === null
                  ? await loadRunInputText(repository, run.projectId, run.id)
                  : null
              let shouldContinue = false

              for await (const event of getRuntime().stream({
                repository,
                run,
                userMessage: inputText ?? undefined,
              })) {
                if (event.type === 'assistant_text_delta') {
                  push('assistant_message_delta', {
                    runId: run.id,
                    messageId: event.messageId,
                    delta: event.delta,
                  })
                  continue
                }

                if (event.type === 'assistant_text_completed') {
                  const assistantMessage = await repository.createMessage({
                    projectId: run.projectId,
                    runId: run.id,
                    kind: 'assistant',
                    payload: {
                      kind: 'assistant',
                      text: event.text,
                      status: 'completed',
                    },
                  })

                  push('assistant_message_completed', {
                    runId: run.id,
                    message: {
                      id: event.messageId,
                      persistedId: assistantMessage.id,
                      projectId: assistantMessage.projectId,
                      runId: assistantMessage.runId,
                      kind: 'assistant',
                      text: event.text,
                      status: 'completed',
                      createdAt: assistantMessage.createdAt,
                    },
                  })
                  continue
                }

                if (event.type === 'tool_request') {
                  const existingToolCall = await repository.getToolCallByCallId(event.toolCall.toolCallId)

                  if (!existingToolCall) {
                    await repository.createToolCall({
                      runId: run.id,
                      projectId: run.projectId,
                      userId: run.userId,
                      toolCallId: event.toolCall.toolCallId,
                      name: event.toolCall.name,
                      input: event.toolCall.input,
                      status: 'pending',
                    })
                  }

                  run = await repository.updateRun(run.id, {
                    status: 'waiting_for_tool',
                    waitingToolCallId: event.toolCall.toolCallId,
                    serializedState: event.serializedState,
                  })
                  await repository.updateProject(run.projectId, {
                    status: 'waiting_for_tool',
                  })

                  shouldContinue = true
                  break
                }

                if (event.type === 'run_completed') {
                  run = await repository.updateRun(run.id, {
                    status: 'completed',
                    waitingToolCallId: null,
                    serializedState: null,
                    finishedAt: new Date().toISOString(),
                  })
                  await repository.updateProject(run.projectId, {
                    status: 'idle',
                  })

                  push('run_completed', {
                    run,
                  })
                  controller.close()
                  return
                }

                if (event.type === 'run_failed') {
                  await failRun(event.message)
                  return
                }
              }

              if (!shouldContinue) {
                controller.close()
                return
              }
            }
          } catch (error) {
            const failedRun = await repository.updateRun(run.id, {
              status: 'failed',
              lastError: {
                message: error instanceof Error ? error.message : 'Unexpected run failure',
              },
              finishedAt: new Date().toISOString(),
            })
            await repository.updateProject(run.projectId, {
              status: 'error',
            })
            push('run_failed', {
              runId: run.id,
              error: {
                code: 'OPENAI_UPSTREAM_ERROR',
                message: error instanceof Error ? error.message : 'Unexpected run failure',
              },
              run: failedRun,
            })
            controller.close()
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      })
    })
    .post('/runs/:runId/cancel', async (c) => {
      const repository = c.get('repository')
      const run = await repository.getRunById(c.req.param('runId'))

      if (!run || run.userId !== c.get('currentUserId')) {
        return c.json(
          {
            error: {
              code: 'RUN_NOT_FOUND',
              message: 'Active run not found',
            },
          },
          404,
        )
      }

      if (!['queued', 'running', 'waiting_for_tool'].includes(run.status)) {
        return c.json(
          {
            error: {
              code: 'RUN_NOT_FOUND',
              message: 'Active run not found',
            },
          },
          404,
        )
      }

      const cancelledRun = await repository.updateRun(run.id, {
        status: 'cancelled',
        finishedAt: new Date().toISOString(),
      })
      await repository.updateProject(run.projectId, {
        status: 'idle',
      })

      return c.json(
        {
          run: cancelledRun,
        },
        202,
      )
    })
}
