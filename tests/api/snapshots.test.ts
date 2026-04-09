import { describe, expect, it } from 'vitest'
import { resetEnvCaches } from '@/src/backend/platform/env'
import { buildApiApp } from '@/src/backend/api/app'
import { createTestRepository, registerAndGetSessionCookie } from '@/tests/api/helpers'

function configureEnv() {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/atoms'
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  process.env.VERCEL_TOKEN = 'vercel-token'
  process.env.OPENAI_API_KEY = 'openai-key'
  process.env.OPENAI_MODEL = 'gpt-5.2'
}

describe('snapshot routes', () => {
  it('rejects oversized snapshot uploads', async () => {
    configureEnv()
    process.env.SNAPSHOT_MAX_SIZE_MB = '10'
    resetEnvCaches()

    const app = buildApiApp({ repository: createTestRepository() })
    const cookie = await registerAndGetSessionCookie(app)
    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'Snapshot app',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()
    const oversizedBlob = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'application/gzip' })
    const formData = new FormData()
    formData.set('file', oversizedBlob, 'snapshot.tar.gz')

    const res = await app.request(`/projects/${projectBody.project.id}/snapshots`, {
      method: 'POST',
      body: formData,
      headers: {
        cookie,
      },
    })

    expect(res.status).toBe(413)
  })

  it('lists snapshots for the project owner only', async () => {
    configureEnv()
    process.env.SNAPSHOT_MAX_SIZE_MB = '10'
    resetEnvCaches()

    const repository = createTestRepository()
    const app = buildApiApp({ repository })
    const cookie = await registerAndGetSessionCookie(app, {
      email: 'owner@example.com',
      password: 'password123',
    })
    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'Snapshot list app',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()
    await repository.createSnapshot({
      id: 'snp_list_1',
      projectId: projectBody.project.id,
      storageKey: `${projectBody.project.id}/snp_list_1.tar.gz`,
      summary: 'first',
    })
    await repository.createSnapshot({
      id: 'snp_list_2',
      projectId: projectBody.project.id,
      storageKey: `${projectBody.project.id}/snp_list_2.tar.gz`,
      summary: 'second',
    })

    const ownerRes = await app.request(`/projects/${projectBody.project.id}/snapshots`, {
      headers: {
        cookie,
      },
    })
    expect(ownerRes.status).toBe(200)
    const ownerBody = await ownerRes.json()
    expect(ownerBody.snapshots).toHaveLength(3)
    expect(ownerBody.snapshots.map((snapshot: { summary: string | null }) => snapshot.summary)).toEqual(
      expect.arrayContaining(['Starter template', 'first', 'second']),
    )

    const otherUserCookie = await registerAndGetSessionCookie(app, {
      email: 'other@example.com',
      password: 'password123',
    })
    const otherUserRes = await app.request(`/projects/${projectBody.project.id}/snapshots`, {
      headers: {
        cookie: otherUserCookie,
      },
    })
    expect(otherUserRes.status).toBe(404)
  })

  it('returns snapshot download url for owner only', async () => {
    configureEnv()
    process.env.SNAPSHOT_MAX_SIZE_MB = '10'
    resetEnvCaches()

    const repository = createTestRepository()
    const app = buildApiApp({
      repository,
      snapshotState: {
        getDownloadUrl: async (_snapshotId: string, storageKey: string) =>
          `https://cdn.example.com/${storageKey}`,
      },
    })
    const cookie = await registerAndGetSessionCookie(app, {
      email: 'owner-download@example.com',
      password: 'password123',
    })
    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'Snapshot download app',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()
    await repository.createSnapshot({
      id: 'snp_download_1',
      projectId: projectBody.project.id,
      storageKey: `${projectBody.project.id}/snp_download_1.tar.gz`,
    })

    const ownerRes = await app.request('/snapshots/snp_download_1/download', {
      headers: {
        cookie,
      },
    })
    expect(ownerRes.status).toBe(200)
    const ownerBody = await ownerRes.json()
    expect(ownerBody.downloadUrl).toBe(
      `https://cdn.example.com/${projectBody.project.id}/snp_download_1.tar.gz`,
    )

    const otherUserCookie = await registerAndGetSessionCookie(app, {
      email: 'other-download@example.com',
      password: 'password123',
    })
    const otherUserRes = await app.request('/snapshots/snp_download_1/download', {
      headers: {
        cookie: otherUserCookie,
      },
    })
    expect(otherUserRes.status).toBe(404)
  })

  it('streams snapshot file bytes for owner only', async () => {
    configureEnv()
    process.env.SNAPSHOT_MAX_SIZE_MB = '10'
    resetEnvCaches()

    const repository = createTestRepository()
    const app = buildApiApp({
      repository,
      snapshotState: {
        downloadFile: async () => new Blob(['snapshot-bytes'], { type: 'application/gzip' }),
      },
    })
    const cookie = await registerAndGetSessionCookie(app, {
      email: 'owner-file@example.com',
      password: 'password123',
    })
    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'Snapshot file app',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()
    await repository.createSnapshot({
      id: 'snp_file_1',
      projectId: projectBody.project.id,
      storageKey: `${projectBody.project.id}/snp_file_1.tar.gz`,
    })

    const ownerRes = await app.request('/snapshots/snp_file_1/file', {
      headers: {
        cookie,
      },
    })
    expect(ownerRes.status).toBe(200)
    expect(ownerRes.headers.get('content-type')).toContain('application/gzip')
    expect(await ownerRes.text()).toBe('snapshot-bytes')

    const otherUserCookie = await registerAndGetSessionCookie(app, {
      email: 'other-file@example.com',
      password: 'password123',
    })
    const otherUserRes = await app.request('/snapshots/snp_file_1/file', {
      headers: {
        cookie: otherUserCookie,
      },
    })
    expect(otherUserRes.status).toBe(404)
  })
})
