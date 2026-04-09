import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { ApiHttpError } from '@/src/backend/api/errors'
import { requireAuth } from '@/src/backend/api/context'
import { serverEnv } from '@/src/backend/platform/env'
import {
  buildSnapshotFileUrl,
  downloadSnapshot,
  toSnapshotBuffer,
  uploadSnapshot,
} from '@/src/backend/storage/snapshots'

type SnapshotRouteDeps = {
  uploadFile?: (storageKey: string, file: Blob) => Promise<void>
  getDownloadUrl?: (snapshotId: string, storageKey: string) => Promise<string> | string
  downloadFile?: (storageKey: string) => Promise<Blob>
}

export function buildSnapshotRoutes({
  uploadFile = uploadSnapshot,
  getDownloadUrl = (snapshotId: string) => buildSnapshotFileUrl(snapshotId),
  downloadFile = downloadSnapshot,
}: SnapshotRouteDeps = {}) {
  return new Hono()
    .use('*', requireAuth)
    .post('/projects/:projectId/snapshots', async (c) => {
      const repository = c.get('repository')
      const projectId = c.req.param('projectId')
      const project = await repository.getProjectById(c.get('currentUserId'), projectId)

      if (!project) {
        throw new ApiHttpError(404, 'NOT_FOUND', 'Project not found')
      }

      const formData = await c.req.formData()
      const file = formData.get('file')

      if (typeof file === 'string' || file === null) {
        throw new ApiHttpError(400, 'VALIDATION', 'Snapshot file is required')
      }

      const maxBytes = serverEnv.SNAPSHOT_MAX_SIZE_MB * 1024 * 1024
      if (file.size > maxBytes) {
        throw new ApiHttpError(413, 'PAYLOAD_TOO_LARGE', 'Snapshot exceeds max size')
      }

      const snapshotId = `snp_${randomUUID()}`
      const storageKey = `${projectId}/${snapshotId}.tar.gz`
      await uploadFile(storageKey, file)

      const summaryEntry = formData.get('summary')
      const snapshot = await repository.createSnapshot({
        id: snapshotId,
        projectId,
        storageKey,
        summary: typeof summaryEntry === 'string' ? summaryEntry : null,
      })
      await repository.updateProject(projectId, {
        latestSnapshotId: snapshot.id,
      })

      return c.json(
        {
          snapshot,
        },
        201,
      )
    })
    .get('/projects/:projectId/snapshots', async (c) => {
      const repository = c.get('repository')
      const projectId = c.req.param('projectId')
      const project = await repository.getProjectById(c.get('currentUserId'), projectId)

      if (!project) {
        throw new ApiHttpError(404, 'NOT_FOUND', 'Project not found')
      }

      const snapshots = await repository.listSnapshots(projectId)

      return c.json({
        snapshots,
      })
    })
    .get('/snapshots/:snapshotId/download', async (c) => {
      const repository = c.get('repository')
      const snapshotId = c.req.param('snapshotId')
      const snapshot = await repository.getSnapshotById(snapshotId)

      if (!snapshot) {
        throw new ApiHttpError(404, 'NOT_FOUND', 'Snapshot not found')
      }

      const project = await repository.getProjectById(c.get('currentUserId'), snapshot.projectId)

      if (!project) {
        throw new ApiHttpError(404, 'NOT_FOUND', 'Snapshot not found')
      }

      const downloadUrl = await getDownloadUrl(snapshot.id, snapshot.storageKey)

      return c.json({
        downloadUrl,
      })
    })
    .get('/snapshots/:snapshotId/file', async (c) => {
      const repository = c.get('repository')
      const snapshotId = c.req.param('snapshotId')
      const snapshot = await repository.getSnapshotById(snapshotId)

      if (!snapshot) {
        throw new ApiHttpError(404, 'NOT_FOUND', 'Snapshot not found')
      }

      const project = await repository.getProjectById(c.get('currentUserId'), snapshot.projectId)

      if (!project) {
        throw new ApiHttpError(404, 'NOT_FOUND', 'Snapshot not found')
      }

      try {
        const file = await downloadFile(snapshot.storageKey)
        const fileBuffer = await toSnapshotBuffer(file)

        return new Response(new Uint8Array(fileBuffer), {
          status: 200,
          headers: {
            'content-type': file.type || 'application/gzip',
            'cache-control': 'no-store',
            'content-disposition': `inline; filename=\"${snapshot.id}.tar.gz\"`,
          },
        })
      } catch (error) {
        throw new ApiHttpError(
          500,
          'SNAPSHOT_FILE_READ_FAILED',
          error instanceof Error ? error.message : 'Failed to read snapshot file',
        )
      }
    })
}
