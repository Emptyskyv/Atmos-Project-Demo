import { Hono } from 'hono'
import type { AgentRuntime } from '@/src/backend/agent/runtime'
import type { ToolExecutor } from '@/src/backend/agent/tool-executor'
import type { PublishService } from '@/src/backend/publish/deploy'
import { createPrismaRepository } from '@/src/backend/data/prisma'
import type { AppRepository } from '@/src/backend/data/types'
import type { ApiVariables } from '@/src/backend/api/context'
import { ApiHttpError } from '@/src/backend/api/errors'
import { authRoutes } from '@/src/backend/api/routes/auth'
import { messageRoutes } from '@/src/backend/api/routes/messages'
import { buildPublishRoutes } from '@/src/backend/api/routes/publish'
import { buildProjectRoutes } from '@/src/backend/api/routes/projects'
import { buildSnapshotRoutes } from '@/src/backend/api/routes/snapshots'
import { buildRunRoutes } from '@/src/backend/api/routes/runs'

type ApiAppDeps = {
  repository?: AppRepository
  runtime?: AgentRuntime
  toolExecutor?: ToolExecutor
  runState?: {
    hasActiveRun?: (projectId: string) => boolean
  }
  publish?: PublishService
  publishState?: {
    countForToday?: (userId: string) => number
  }
  snapshotState?: {
    uploadFile?: (storageKey: string, file: Blob) => Promise<void>
    getDownloadUrl?: (snapshotId: string, storageKey: string) => Promise<string> | string
    downloadFile?: (storageKey: string) => Promise<Blob>
  }
  projectState?: {
    uploadFile?: (storageKey: string, file: Blob) => Promise<void>
  }
}

function normalizeApiPath(request: Request) {
  const pathname = new URL(request.url).pathname

  if (pathname === '/api') {
    return '/'
  }

  if (pathname.startsWith('/api/')) {
    return pathname.slice(4)
  }

  return pathname
}

export function buildApiApp(deps: ApiAppDeps = {}) {
  const repository = deps.repository ?? createPrismaRepository()
  const app = new Hono<{ Variables: ApiVariables }>({
    getPath: normalizeApiPath,
  })

  app.use('*', async (c, next) => {
    c.set('repository', repository)
    await next()
  })

  app.route('/auth', authRoutes)
  app.route(
    '/projects',
    buildProjectRoutes({
      uploadFile: deps.projectState?.uploadFile ?? deps.snapshotState?.uploadFile,
    }),
  )
  app.route('/', messageRoutes)
  app.route(
    '/',
    buildRunRoutes({
      runtime: deps.runtime,
      hasActiveRun: deps.runState?.hasActiveRun,
      toolExecutor: deps.toolExecutor,
    }),
  )
  app.route(
    '/',
    buildPublishRoutes({
      publishService: deps.publish,
      countForToday: deps.publishState?.countForToday,
    }),
  )
  app.route(
    '/',
    buildSnapshotRoutes({
      uploadFile: deps.snapshotState?.uploadFile,
      getDownloadUrl: deps.snapshotState?.getDownloadUrl,
      downloadFile: deps.snapshotState?.downloadFile,
    }),
  )

  app.onError((error, c) => {
    if (error instanceof ApiHttpError) {
      return c.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        error.status,
      )
    }

    return c.json(
      {
        error: {
          code: 'INTERNAL',
          message: 'Unexpected server error',
        },
      },
      500,
    )
  })

  return app
}
