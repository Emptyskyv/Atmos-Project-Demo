// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPreviewUrlMock = vi.fn()

vi.mock('@/src/backend/workspace/process-manager', () => ({
  processManager: {
    getPreviewUrl: getPreviewUrlMock,
  },
}))

describe('preview proxy route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    getPreviewUrlMock.mockReset()
  })

  it('returns 404 when no preview server is running for the project', async () => {
    getPreviewUrlMock.mockReturnValue(null)

    const { GET } = await import('@/app/preview/[projectId]/[[...path]]/route')
    const response = await GET(new Request('https://atoms.example.com/preview/proj-missing'), {
      params: Promise.resolve({
        projectId: 'proj-missing',
        path: undefined,
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'PREVIEW_NOT_FOUND',
        message: 'Preview server is not running for this project.',
      },
    })
  })

  it('proxies preview requests to the local project server', async () => {
    getPreviewUrlMock.mockReturnValue('http://127.0.0.1:4123')
    const fetchMock = vi.fn(async () =>
      new Response('<html><body>preview</body></html>', {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { GET } = await import('@/app/preview/[projectId]/[[...path]]/route')
    const response = await GET(
      new Request('https://atoms.example.com/preview/proj-live/_next/static/chunk.js?ts=1', {
        headers: {
          accept: 'text/html',
          cookie: 'session=abc',
          host: 'atoms.example.com',
        },
      }),
      {
        params: Promise.resolve({
          projectId: 'proj-live',
          path: ['_next', 'static', 'chunk.js'],
        }),
      },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4123/_next/static/chunk.js?ts=1',
      expect.objectContaining({
        method: 'GET',
      }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    await expect(response.text()).resolves.toContain('preview')
  })
})
