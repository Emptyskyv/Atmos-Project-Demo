import { zValidator } from '@hono/zod-validator'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { uploadSnapshot } from '@/src/backend/storage/snapshots'
import { toTarGzBlob } from '@/src/frontend/workspace/tarball'
import { getTemplateFiles } from '@/src/backend/workspace/templates'
import { localWorkspace } from '@/src/backend/workspace/local'
import { processManager } from '@/src/backend/workspace/process-manager'
import { toPublicPreviewUrl } from '@/src/backend/workspace/preview-path'
import { requireAuth } from '@/src/backend/api/context'

const createProjectSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  templateKey: z.string().min(1),
})

type ProjectRouteDeps = {
  uploadFile?: (storageKey: string, file: Blob) => Promise<void>
}

export function buildProjectRoutes({ uploadFile = uploadSnapshot }: ProjectRouteDeps = {}) {
  return new Hono()
    .use('*', requireAuth)
    .get('/', async (c) => {
      const projects = await c.get('repository').listProjects(c.get('currentUserId'))
      return c.json({ projects })
    })
    .get('/:projectId', async (c) => {
      const repository = c.get('repository')
      const project = await repository.getProjectById(c.get('currentUserId'), c.req.param('projectId'))

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

      const [latestRun] = await repository.listRuns(project.id, 1)
      const [latestSnapshot] = await repository.listSnapshots(project.id)

      try {
        await localWorkspace.ensureWorkspace(project.id, project.latestSnapshotId)
      } catch {
        await localWorkspace.ensureWorkspace(project.id, null)

        const currentFiles = await localWorkspace.listFiles(project.id)

        if (currentFiles.length === 0) {
          for (const file of getTemplateFiles(project.templateKey)) {
            await localWorkspace.writeFile(project.id, file.path, file.contents)
          }
        }
      }
      const workspaceFiles = await localWorkspace.listFiles(project.id)

      return c.json({
        project,
        latestRun: latestRun ?? null,
        latestSnapshot: latestSnapshot ?? null,
        workspace: {
          files: workspaceFiles,
          previewUrl: toPublicPreviewUrl(project.id, processManager.getPreviewUrl(project.id)),
        },
      })
    })
    .post('/', zValidator('json', createProjectSchema), async (c) => {
      const body = c.req.valid('json')
      const repository = c.get('repository')
      const project = await repository.createProject({
        userId: c.get('currentUserId'),
        name: body.name,
        description: body.description ?? null,
        templateKey: body.templateKey,
        status: 'idle',
      })

      const snapshotId = `snp_${randomUUID()}`
      const storageKey = `${project.id}/${snapshotId}.tar.gz`
      const starterFiles = getTemplateFiles(body.templateKey)
      const starterBlob = toTarGzBlob(starterFiles)

      await uploadFile(storageKey, starterBlob)
      const snapshot = await repository.createSnapshot({
        id: snapshotId,
        projectId: project.id,
        storageKey,
        summary: 'Starter template',
      })
      const updatedProject = await repository.updateProject(project.id, {
        latestSnapshotId: snapshot.id,
      })

      return c.json(
        {
          project: updatedProject,
        },
        201,
      )
    })
}

export const projectRoutes = buildProjectRoutes()
