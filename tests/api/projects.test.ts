// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { buildApiApp } from '@/src/backend/api/app'
import { createTestRepository, registerAndGetSessionCookie } from '@/tests/api/helpers'

describe('projects routes', () => {
  it('returns 401 for /auth/me without a session', async () => {
    const app = buildApiApp({ repository: createTestRepository() })
    const res = await app.request('/auth/me')

    expect(res.status).toBe(401)
  })

  it('validates POST /projects input', async () => {
    const app = buildApiApp({ repository: createTestRepository() })
    const cookie = await registerAndGetSessionCookie(app)
    const res = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({ name: '', templateKey: '' }),
    })

    expect(res.status).toBe(400)
  })

  it('creates and lists projects for the signed-in user', async () => {
    const app = buildApiApp({
      repository: createTestRepository(),
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
      body: JSON.stringify({ name: 'Atoms MVP', templateKey: 'next-app' }),
    })

    expect(createRes.status).toBe(201)

    const listRes = await app.request('/projects', {
      headers: {
        cookie,
      },
    })

    expect(listRes.status).toBe(200)

    const body = await listRes.json()
    expect(body.projects).toHaveLength(1)
    expect(body.projects[0].name).toBe('Atoms MVP')
  })

  it('creates an initial starter snapshot for new projects', async () => {
    const repository = createTestRepository()
    const uploadFile = vi.fn(async () => undefined)
    const app = buildApiApp({
      repository,
      projectState: {
        uploadFile,
      },
    })
    const cookie = await registerAndGetSessionCookie(app)

    const createRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({ name: 'Starter Project', templateKey: 'next-app' }),
    })

    expect(createRes.status).toBe(201)
    const createBody = await createRes.json()
    expect(uploadFile).toHaveBeenCalledTimes(1)
    expect(createBody.project.latestSnapshotId).toBeTruthy()

    const snapshots = await repository.listSnapshots(createBody.project.id)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.id).toBe(createBody.project.latestSnapshotId)
    expect(snapshots[0]?.summary).toBe('Starter template')

    const projectRes = await app.request(`/projects/${createBody.project.id}`, {
      headers: {
        cookie,
      },
    })

    expect(projectRes.status).toBe(200)
    const projectBody = await projectRes.json()
    expect(projectBody.workspace?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'app/page.tsx' }),
      ]),
    )
  })

  it('restores starter workspace files when the app is built with an injected repository', async () => {
    const repository = createTestRepository()
    const app = buildApiApp({ repository })
    const cookie = await registerAndGetSessionCookie(app)

    const createRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({ name: 'Workspace Restore', templateKey: 'next-app' }),
    })

    expect(createRes.status).toBe(201)
    const createBody = await createRes.json()

    const projectRes = await app.request(`/projects/${createBody.project.id}`, {
      headers: {
        cookie,
      },
    })

    expect(projectRes.status).toBe(200)
    const projectBody = await projectRes.json()
    expect(projectBody.workspace?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'app/page.tsx' }),
      ]),
    )
  })
})
