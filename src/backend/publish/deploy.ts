import { randomUUID } from 'node:crypto'
import { serverEnv } from '@/src/backend/platform/env'
import { normalizeProjectSlug } from '@/src/backend/publish/project-map'
import { downloadSnapshot } from '@/src/backend/storage/snapshots'
import { fromTarGzBlob } from '@/src/frontend/workspace/tarball'

export type PublishJobStatus = 'queued' | 'uploading' | 'building' | 'ready' | 'error'

export interface PublishJobRecord {
  id: string
  projectId: string
  snapshotId: string
  status: PublishJobStatus
  deployedUrl: string | null
  error: { code: string; message: string } | null
  createdAt: string
}

export interface PublishStreamEvent {
  status: PublishJobStatus
  deployedUrl: string | null
  error: { code: string; message: string } | null
}

export interface PublishService {
  queuePublish(input: {
    projectId: string
    snapshotId: string
    displayName?: string
  }): Promise<PublishJobRecord>
  streamPublish?(input: {
    publishJobId: string
    projectId: string
    snapshotId: string
  }): AsyncGenerator<PublishStreamEvent, void, void>
}

type WorkspaceFile = {
  path: string
  contents: string
}

type PublishServiceDeps = {
  fetchImpl?: typeof fetch
  loadSnapshotFiles?: (projectId: string, snapshotId: string) => Promise<WorkspaceFile[]>
  sleep?: (ms: number) => Promise<void>
}

function buildVercelApiUrl(pathname: string) {
  const url = new URL(`https://api.vercel.com${pathname}`)

  if (serverEnv.VERCEL_TEAM_ID) {
    url.searchParams.set('teamId', serverEnv.VERCEL_TEAM_ID)
  }

  return url.toString()
}

function toDeployedUrl(url: string | null | undefined) {
  if (!url) {
    return null
  }

  return url.startsWith('http') ? url : `https://${url}`
}

function toPublishedUrl(
  deployment: {
    url?: string | null
    alias?: string[] | null
  },
  preferredAlias?: string,
) {
  const aliases = Array.isArray(deployment.alias) ? deployment.alias.filter(Boolean) : []
  const selectedAlias =
    (preferredAlias ? aliases.find((alias) => alias === preferredAlias) : null) ?? aliases[0] ?? null

  return toDeployedUrl(selectedAlias ?? deployment.url)
}

function toPublishStatus(readyState: unknown): PublishJobStatus {
  switch (String(readyState).toUpperCase()) {
    case 'READY':
      return 'ready'
    case 'ERROR':
    case 'CANCELED':
      return 'error'
    case 'BUILDING':
      return 'building'
    default:
      return 'uploading'
  }
}

function toPublishError(deployment: { readyStateReason?: string | null }) {
  if (!deployment.readyStateReason) {
    return {
      code: 'VERCEL_DEPLOY_FAILED',
      message: 'Vercel deployment failed',
    }
  }

  return {
    code: 'VERCEL_DEPLOY_FAILED',
    message: deployment.readyStateReason,
  }
}

async function loadSnapshotFilesFromStorage(projectId: string, snapshotId: string) {
  return fromTarGzBlob(await downloadSnapshot(`${projectId}/${snapshotId}.tar.gz`))
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function createPublishService({
  fetchImpl = fetch,
  loadSnapshotFiles = loadSnapshotFilesFromStorage,
  sleep: sleepImpl = sleep,
}: PublishServiceDeps = {}): PublishService {
  return {
    async queuePublish({ projectId, snapshotId, displayName }) {
      void serverEnv.VERCEL_TOKEN
      void normalizeProjectSlug(displayName ?? projectId)

      return {
        id: `pub_${randomUUID()}`,
        projectId,
        snapshotId,
        status: 'queued',
        deployedUrl: null,
        error: null,
        createdAt: new Date().toISOString(),
      }
    },
    async *streamPublish({ projectId, snapshotId }) {
      const projectSlug = normalizeProjectSlug(projectId)
      void serverEnv.VERCEL_TOKEN

      yield {
        status: 'uploading',
        deployedUrl: null,
        error: null,
      }

      const files = await loadSnapshotFiles(projectId, snapshotId)

      if (files.length === 0) {
        throw new Error('Snapshot is empty and cannot be deployed')
      }

      const createResponse = await fetchImpl(buildVercelApiUrl('/v13/deployments'), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${serverEnv.VERCEL_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: projectSlug,
          project: projectSlug,
          target: 'production',
          projectSettings: {
            framework: 'nextjs',
          },
          files: files.map((file) => ({
            file: file.path,
            data: file.contents,
          })),
        }),
      })

      if (!createResponse.ok) {
        throw new Error('Failed to create Vercel deployment')
      }

      let deployment = (await createResponse.json()) as {
        id: string
        readyState?: string
        readyStateReason?: string | null
        url?: string | null
        alias?: string[] | null
      }
      let lastStatus: PublishJobStatus | null = null

      while (true) {
        const status = toPublishStatus(deployment.readyState)
        const terminal = status === 'ready' || status === 'error'

        if (status !== lastStatus || terminal) {
          yield {
            status,
            deployedUrl:
              status === 'ready' ? toPublishedUrl(deployment, `${projectSlug}.vercel.app`) : null,
            error: status === 'error' ? toPublishError(deployment) : null,
          }
          lastStatus = status
        }

        if (terminal) {
          return
        }

        await sleepImpl(2000)

        const readResponse = await fetchImpl(buildVercelApiUrl(`/v13/deployments/${deployment.id}`), {
          method: 'GET',
          headers: {
            authorization: `Bearer ${serverEnv.VERCEL_TOKEN}`,
          },
        })

        if (!readResponse.ok) {
          throw new Error('Failed to poll Vercel deployment')
        }

        deployment = (await readResponse.json()) as {
          id: string
          readyState?: string
          readyStateReason?: string | null
          url?: string | null
          alias?: string[] | null
        }
      }
    },
  }
}
