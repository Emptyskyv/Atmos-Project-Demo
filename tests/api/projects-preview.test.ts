// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApiApp } from '@/src/backend/api/app'
import { createTestRepository, registerAndGetSessionCookie } from '@/tests/api/helpers'
import { processManager } from '@/src/backend/workspace/process-manager'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      rm(dir, {
        recursive: true,
        force: true,
      }),
    ),
  )

  await processManager.dispose('proj_preview_test').catch(() => undefined)
})

describe('projects preview urls', () => {
  it('returns a first-party preview path when a local preview server is running', async () => {
    const repository = createTestRepository()
    const app = buildApiApp({
      repository,
      projectState: {
        uploadFile: async () => undefined,
      },
    })
    const cookie = await registerAndGetSessionCookie(app)

    const createRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({ name: 'Preview Project', templateKey: 'next-app' }),
    })
    const createBody = await createRes.json()
    const projectId = createBody.project.id as string

    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'atoms-project-preview-'))
    tempDirs.push(workspaceDir)
    await writeFile(
      path.join(workspaceDir, 'serve.js'),
      'require("node:http").createServer((_, res) => res.end("ok")).listen(process.env.PORT, process.env.HOST); setInterval(() => {}, 1 << 30)\n',
    )

    await processManager.run(projectId, 'node serve.js', {
      workspaceDir,
    })

    const projectRes = await app.request(`/projects/${projectId}`, {
      headers: {
        cookie,
      },
    })
    const projectBody = await projectRes.json()

    expect(projectRes.status).toBe(200)
    expect(projectBody.workspace.previewUrl).toBe(`/preview/${projectId}`)

    await processManager.dispose(projectId)
  })
})
