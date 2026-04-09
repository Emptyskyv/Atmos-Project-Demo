import { Hono } from 'hono'
import { requireAuth } from '@/src/backend/api/context'
import { ApiHttpError } from '@/src/backend/api/errors'

export const messageRoutes = new Hono()
  .use('*', requireAuth)
  .get('/projects/:projectId/messages', async (c) => {
    const repository = c.get('repository')
    const projectId = c.req.param('projectId')
    const project = await repository.getProjectById(c.get('currentUserId'), projectId)

    if (!project) {
      throw new ApiHttpError(404, 'NOT_FOUND', 'Project not found')
    }

    const requestedLimit = Number(c.req.query('limit') ?? '50')
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50
    const before = c.req.query('before')
    const items = await repository.listMessages(projectId, limit + 1, before)
    const visibleItems = items.slice(0, limit)

    return c.json({
      items: visibleItems.map((item) => ({
        id: item.id,
        projectId: item.projectId,
        runId: item.runId,
        createdAt: item.createdAt,
        ...item.payload,
      })),
      hasMore: items.length > limit,
    })
  })
