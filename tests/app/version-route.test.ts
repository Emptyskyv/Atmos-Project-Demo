// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('version route', () => {
  it('returns deploy metadata without requiring authentication', async () => {
    process.env.RAILWAY_DEPLOYMENT_ID = 'dep_123'
    process.env.RAILWAY_GIT_COMMIT_SHA = 'abc123'
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production'
    process.env.RAILWAY_SERVICE_NAME = 'web'

    const { GET } = await import('@/app/version/route')
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      app: 'atoms-project',
      version: '0.1.0',
      deploymentId: 'dep_123',
      commitSha: 'abc123',
      environment: 'production',
      service: 'web',
    })
  })

  it('falls back to null for optional deploy metadata', async () => {
    delete process.env.RAILWAY_DEPLOYMENT_ID
    delete process.env.RAILWAY_GIT_COMMIT_SHA
    delete process.env.VERCEL_GIT_COMMIT_SHA
    delete process.env.RAILWAY_ENVIRONMENT_NAME
    delete process.env.RAILWAY_SERVICE_NAME

    const { GET } = await import('@/app/version/route')
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      app: 'atoms-project',
      version: '0.1.0',
      deploymentId: null,
      commitSha: null,
      environment: null,
      service: null,
    })
  })
})
