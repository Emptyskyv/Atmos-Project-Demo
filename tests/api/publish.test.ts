import { describe, expect, it, vi } from 'vitest'
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
  process.env.PUBLISH_DAILY_LIMIT_PER_USER = '5'
}

describe('publish routes', () => {
  it('returns 202 when publish service accepts a request', async () => {
    configureEnv()
    resetEnvCaches()
    const repository = createTestRepository()

    const publishService = {
      queuePublish: vi.fn(async ({ projectId, snapshotId }) => ({
        id: 'pub_demo',
        projectId,
        snapshotId,
        status: 'queued',
        deployedUrl: null,
        error: null,
        createdAt: new Date().toISOString(),
      })),
    }

    const app = buildApiApp({ repository, publish: publishService })
    const cookie = await registerAndGetSessionCookie(app)
    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'Publishable app',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()
    await repository.createSnapshot({
      id: 'snp_demo',
      projectId: projectBody.project.id,
      storageKey: `${projectBody.project.id}/snp_demo.tar.gz`,
    })
    const res = await app.request(`/projects/${projectBody.project.id}/publish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        snapshotId: 'snp_demo',
        displayName: 'todo-app',
      }),
    })

    expect(res.status).toBe(202)
    expect(publishService.queuePublish).toHaveBeenCalledWith({
      projectId: projectBody.project.id,
      snapshotId: 'snp_demo',
      displayName: 'todo-app',
    })
  })

  it('returns 429 when the daily publish limit is reached', async () => {
    configureEnv()
    resetEnvCaches()
    const repository = createTestRepository()

    const publishService = {
      queuePublish: vi.fn(),
    }

    const app = buildApiApp({
      repository,
      publish: publishService,
      publishState: {
        countForToday: vi.fn().mockReturnValue(5),
      },
    })
    const cookie = await registerAndGetSessionCookie(app)
    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'Rate limit app',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()

    const res = await app.request(`/projects/${projectBody.project.id}/publish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        snapshotId: 'snp_demo',
        displayName: 'todo-app',
      }),
    })

    expect(res.status).toBe(429)
    expect(publishService.queuePublish).not.toHaveBeenCalled()
  })

  it('enforces the default in-memory daily publish limit in the API handler', async () => {
    configureEnv()
    process.env.PUBLISH_DAILY_LIMIT_PER_USER = '1'
    resetEnvCaches()
    const repository = createTestRepository()

    let publishCallCount = 0
    const publishService = {
      queuePublish: vi.fn(async ({ projectId, snapshotId }) => {
        publishCallCount += 1

        return {
          id: `pub_demo_${publishCallCount}`,
          projectId,
          snapshotId,
          status: 'queued',
          deployedUrl: null,
          error: null,
          createdAt: new Date().toISOString(),
        }
      }),
    }

    const app = buildApiApp({ repository, publish: publishService })
    const cookie = await registerAndGetSessionCookie(app)
    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        name: 'Quota app',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()
    await repository.createSnapshot({
      id: 'snp_demo',
      projectId: projectBody.project.id,
      storageKey: `${projectBody.project.id}/snp_demo.tar.gz`,
    })

    const firstRes = await app.request(`/projects/${projectBody.project.id}/publish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        snapshotId: 'snp_demo',
        displayName: 'todo-app',
      }),
    })

    const secondRes = await app.request(`/projects/${projectBody.project.id}/publish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        snapshotId: 'snp_demo',
        displayName: 'todo-app',
      }),
    })

    expect(firstRes.status).toBe(202)
    expect(secondRes.status).toBe(429)
  })

  it('returns publish job details for the project owner only', async () => {
    configureEnv()
    resetEnvCaches()

    const repository = createTestRepository()
    const app = buildApiApp({ repository })
    const ownerCookie = await registerAndGetSessionCookie(app, {
      email: 'publish-owner@example.com',
      password: 'password123',
    })
    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookie,
      },
      body: JSON.stringify({
        name: 'Publish read app',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()
    await repository.createSnapshot({
      id: 'snp_publish_read',
      projectId: projectBody.project.id,
      storageKey: `${projectBody.project.id}/snp_publish_read.tar.gz`,
    })
    await repository.createPublishJob({
      id: 'pub_read_1',
      projectId: projectBody.project.id,
      snapshotId: 'snp_publish_read',
      status: 'queued',
      deployedUrl: null,
    })

    const ownerRes = await app.request('/publish/pub_read_1', {
      headers: {
        cookie: ownerCookie,
      },
    })
    expect(ownerRes.status).toBe(200)
    const ownerBody = await ownerRes.json()
    expect(ownerBody.publishJob.id).toBe('pub_read_1')
    expect(ownerBody.streamUrl).toBe('/api/publish/pub_read_1/stream')

    const otherCookie = await registerAndGetSessionCookie(app, {
      email: 'publish-other@example.com',
      password: 'password123',
    })
    const otherRes = await app.request('/publish/pub_read_1', {
      headers: {
        cookie: otherCookie,
      },
    })
    expect(otherRes.status).toBe(404)
  })

  it('streams publish updates via SSE and persists the latest status', async () => {
    configureEnv()
    resetEnvCaches()

    const repository = createTestRepository()
    const publishService = {
      queuePublish: vi.fn(async ({ projectId, snapshotId }) => ({
        id: 'pub_stream_1',
        projectId,
        snapshotId,
        status: 'queued',
        deployedUrl: null,
        error: null,
        createdAt: new Date().toISOString(),
      })),
      streamPublish: vi.fn(async function* () {
        yield { status: 'uploading' as const, deployedUrl: null, error: null }
        yield { status: 'building' as const, deployedUrl: null, error: null }
        yield {
          status: 'ready' as const,
          deployedUrl: 'https://stream-ready.example.vercel.app',
          error: null,
        }
      }),
    }

    const app = buildApiApp({
      repository,
      publish: publishService,
    })
    const ownerCookie = await registerAndGetSessionCookie(app, {
      email: 'publish-stream-owner@example.com',
      password: 'password123',
    })
    const projectRes = await app.request('/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookie,
      },
      body: JSON.stringify({
        name: 'Publish stream app',
        templateKey: 'next-app',
      }),
    })
    const projectBody = await projectRes.json()
    await repository.createSnapshot({
      id: 'snp_publish_stream',
      projectId: projectBody.project.id,
      storageKey: `${projectBody.project.id}/snp_publish_stream.tar.gz`,
    })
    await repository.createPublishJob({
      id: 'pub_stream_1',
      projectId: projectBody.project.id,
      snapshotId: 'snp_publish_stream',
      status: 'queued',
    })

    const streamRes = await app.request('/publish/pub_stream_1/stream', {
      headers: {
        cookie: ownerCookie,
      },
    })
    expect(streamRes.status).toBe(200)
    expect(streamRes.headers.get('content-type')).toContain('text/event-stream')
    const streamText = await streamRes.text()
    expect(streamText).toContain('event: publish_updated')
    expect(streamText).toContain('"status":"uploading"')
    expect(streamText).toContain('"status":"ready"')
    expect(streamText).toContain('stream-ready.example.vercel.app')

    const publishReadRes = await app.request('/publish/pub_stream_1', {
      headers: {
        cookie: ownerCookie,
      },
    })
    expect(publishReadRes.status).toBe(200)
    const publishReadBody = await publishReadRes.json()
    expect(publishReadBody.publishJob.status).toBe('ready')
    expect(publishReadBody.publishJob.deployedUrl).toBe('https://stream-ready.example.vercel.app')

    const otherCookie = await registerAndGetSessionCookie(app, {
      email: 'publish-stream-other@example.com',
      password: 'password123',
    })
    const otherStreamRes = await app.request('/publish/pub_stream_1/stream', {
      headers: {
        cookie: otherCookie,
      },
    })
    expect(otherStreamRes.status).toBe(404)

    const projectReadRes = await app.request(`/projects/${projectBody.project.id}`, {
      headers: {
        cookie: ownerCookie,
      },
    })
    const projectReadBody = await projectReadRes.json()
    expect(projectReadBody.project.status).toBe('ready')
    expect(projectReadBody.project.deployedUrl).toBe('https://stream-ready.example.vercel.app')
  })
})
