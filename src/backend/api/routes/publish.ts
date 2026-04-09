import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { assertPublishLimit } from '@/src/backend/platform/limits'
import {
  createPublishService,
  type PublishJobStatus,
  type PublishService,
  type PublishStreamEvent,
} from '@/src/backend/publish/deploy'
import { requireAuth } from '@/src/backend/api/context'
import { ApiHttpError } from '@/src/backend/api/errors'

const publishSchema = z.object({
  snapshotId: z.string().min(1),
  displayName: z.string().optional(),
})

type PublishRouteDeps = {
  publishService?: PublishService
  countForToday?: (userId: string) => number
}

function buildSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

async function getOwnedPublishJob(
  repository: {
    getPublishJobById: (id: string) => Promise<{
      id: string
      projectId: string
      snapshotId: string
      status: string
      deployedUrl: string | null
      lastError: unknown
      createdAt: string
    } | null>
    getProjectById: (userId: string, projectId: string) => Promise<{ id: string } | null>
  },
  userId: string,
  publishJobId: string,
) {
  const publishJob = await repository.getPublishJobById(publishJobId)

  if (!publishJob) {
    throw new ApiHttpError(404, 'NOT_FOUND', 'Publish job not found')
  }

  const project = await repository.getProjectById(userId, publishJob.projectId)

  if (!project) {
    throw new ApiHttpError(404, 'NOT_FOUND', 'Publish job not found')
  }

  return publishJob
}

function isTerminalStatus(status: PublishJobStatus) {
  return status === 'ready' || status === 'error'
}

export function buildPublishRoutes({
  publishService = createPublishService(),
  countForToday,
}: PublishRouteDeps = {}) {
  return new Hono()
    .use('*', requireAuth)
    .post('/projects/:projectId/publish', zValidator('json', publishSchema), async (c) => {
      const userId = c.get('currentUserId')
      const repository = c.get('repository')
      const projectId = c.req.param('projectId')
      const project = await repository.getProjectById(userId, projectId)

      if (!project) {
        throw new ApiHttpError(404, 'NOT_FOUND', 'Project not found')
      }

      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const todaysCount = countForToday
        ? countForToday(userId)
        : await repository.countPublishJobsForUserSince(userId, startOfDay.toISOString())

      assertPublishLimit(todaysCount)

      const body = c.req.valid('json')
      const snapshot = await repository.getSnapshotById(body.snapshotId)

      if (!snapshot || snapshot.projectId !== project.id) {
        throw new ApiHttpError(404, 'NOT_FOUND', 'Snapshot not found')
      }

      const publishJob = await publishService.queuePublish({
        projectId,
        snapshotId: body.snapshotId,
        displayName: body.displayName,
      })
      await repository.createPublishJob({
        id: publishJob.id,
        projectId: publishJob.projectId,
        snapshotId: publishJob.snapshotId,
        status: publishJob.status,
        deployedUrl: publishJob.deployedUrl,
        lastError: publishJob.error,
      })
      await repository.updateProject(projectId, {
        status: 'publishing',
      })

      return c.json(
        {
          publishJob,
          streamUrl: `/api/publish/${publishJob.id}/stream`,
        },
        202,
      )
    })
    .get('/publish/:publishJobId', async (c) => {
      const repository = c.get('repository')
      const publishJob = await getOwnedPublishJob(
        repository,
        c.get('currentUserId'),
        c.req.param('publishJobId'),
      )

      return c.json({
        publishJob,
        streamUrl: `/api/publish/${publishJob.id}/stream`,
      })
    })
    .get('/publish/:publishJobId/stream', async (c) => {
      const repository = c.get('repository')
      const publishJobId = c.req.param('publishJobId')
      const currentUserId = c.get('currentUserId')
      const existingJob = await getOwnedPublishJob(repository, currentUserId, publishJobId)
      const encoder = new TextEncoder()

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const push = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(buildSseEvent(event, data)))
          }

          let latestPublishJob = existingJob

          try {
            push('publish_updated', {
              publishJob: latestPublishJob,
            })

            const emitAndPersist = async (event: PublishStreamEvent) => {
              latestPublishJob = await repository.updatePublishJob(existingJob.id, {
                status: event.status,
                deployedUrl: event.deployedUrl ?? null,
                lastError: event.error ?? null,
              })

              if (event.status === 'ready') {
                await repository.updateProject(existingJob.projectId, {
                  status: 'ready',
                  deployedUrl: event.deployedUrl ?? null,
                })
              } else if (event.status === 'error') {
                await repository.updateProject(existingJob.projectId, {
                  status: 'error',
                })
              } else {
                await repository.updateProject(existingJob.projectId, {
                  status: 'publishing',
                })
              }

              push('publish_updated', {
                publishJob: latestPublishJob,
              })
            }

            if (publishService.streamPublish && !isTerminalStatus(existingJob.status as PublishJobStatus)) {
              for await (const event of publishService.streamPublish({
                publishJobId: existingJob.id,
                projectId: existingJob.projectId,
                snapshotId: existingJob.snapshotId,
              })) {
                await emitAndPersist(event)
                if (isTerminalStatus(event.status)) {
                  break
                }
              }
            }
          } catch (error) {
            latestPublishJob = await repository.updatePublishJob(existingJob.id, {
              status: 'error',
              lastError: {
                message: error instanceof Error ? error.message : 'Unexpected publish failure',
              },
            })
            await repository.updateProject(existingJob.projectId, {
              status: 'error',
            })
            push('publish_updated', {
              publishJob: latestPublishJob,
            })
          } finally {
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
}
