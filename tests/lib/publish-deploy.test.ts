import { describe, expect, it, vi } from 'vitest'
import { resetEnvCaches } from '@/src/backend/platform/env'
import { createPublishService } from '@/src/backend/publish/deploy'

function configureEnv() {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/atoms'
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  process.env.VERCEL_TOKEN = 'vercel-token'
  process.env.OPENAI_API_KEY = 'openai-key'
  process.env.OPENAI_MODEL = 'gpt-5.2'
}

describe('createPublishService', () => {
  it('generates a distinct publish job id for each queued publish', async () => {
    configureEnv()
    resetEnvCaches()

    const service = createPublishService()
    const first = await service.queuePublish({
      projectId: 'proj_1',
      snapshotId: 'snp_1',
    })
    const second = await service.queuePublish({
      projectId: 'proj_1',
      snapshotId: 'snp_2',
    })

    expect(first.id).not.toBe(second.id)
  })

  it('creates a Vercel deployment from snapshot files and resolves a ready URL', async () => {
    configureEnv()
    process.env.VERCEL_TEAM_ID = 'team_123'
    resetEnvCaches()

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'dpl_1',
          readyState: 'BUILDING',
          url: 'atoms-preview.vercel.app',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'dpl_1',
          readyState: 'READY',
          url: 'atoms-preview.vercel.app',
        }),
      })

    const service = createPublishService({
      fetchImpl: fetchMock as typeof fetch,
      loadSnapshotFiles: async () => [
        {
          path: 'package.json',
          contents: '{"name":"demo"}',
        },
        {
          path: 'app/page.tsx',
          contents: 'export default function Page() { return <main>Hello</main> }',
        },
      ],
      sleep: async () => undefined,
    })

    const events = []
    for await (const event of service.streamPublish!({
      publishJobId: 'pub_1',
      projectId: 'proj_1',
      snapshotId: 'snp_1',
    })) {
      events.push(event)
    }

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/v13/deployments')
    expect(fetchMock.mock.calls[0]?.[0]).toContain('teamId=team_123')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      name: 'proj-1',
      project: 'proj-1',
      target: 'production',
      files: [
        { file: 'package.json', data: '{"name":"demo"}' },
        {
          file: 'app/page.tsx',
          data: 'export default function Page() { return <main>Hello</main> }',
        },
      ],
    })
    expect(events).toEqual([
      {
        status: 'uploading',
        deployedUrl: null,
        error: null,
      },
      {
        status: 'building',
        deployedUrl: null,
        error: null,
      },
      {
        status: 'ready',
        deployedUrl: 'https://atoms-preview.vercel.app',
        error: null,
      },
    ])
  })

  it('prefers the production alias over the generated deployment url when ready', async () => {
    configureEnv()
    resetEnvCaches()

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'dpl_2',
          readyState: 'BUILDING',
          url: 'atoms-generated.vercel.app',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'dpl_2',
          readyState: 'READY',
          url: 'atoms-generated.vercel.app',
          alias: ['atoms-live.vercel.app', 'atoms-team.vercel.app'],
        }),
      })

    const service = createPublishService({
      fetchImpl: fetchMock as typeof fetch,
      loadSnapshotFiles: async () => [
        {
          path: 'package.json',
          contents: '{"name":"demo"}',
        },
      ],
      sleep: async () => undefined,
    })

    const events = []
    for await (const event of service.streamPublish!({
      publishJobId: 'pub_2',
      projectId: 'proj_2',
      snapshotId: 'snp_2',
    })) {
      events.push(event)
    }

    expect(events.at(-1)).toEqual({
      status: 'ready',
      deployedUrl: 'https://atoms-live.vercel.app',
      error: null,
    })
  })
})
