import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createBrowserClientMock = vi.fn()
const parsePublicSupabaseEnvMock = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: createBrowserClientMock,
}))

vi.mock('@/src/backend/platform/env', () => ({
  parsePublicSupabaseEnv: parsePublicSupabaseEnvMock,
  publicSupabaseEnv: new Proxy(
    {},
    {
      get() {
        throw new Error('publicSupabaseEnv proxy should not be used in browser client helper')
      },
    },
  ),
}))

describe('createSupabaseBrowserClient', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  beforeEach(() => {
    vi.resetModules()
    createBrowserClientMock.mockReset()
    parsePublicSupabaseEnvMock.mockReset()

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    parsePublicSupabaseEnvMock.mockReturnValue({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    })
    createBrowserClientMock.mockReturnValue({ kind: 'browser-client' })
  })

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    }

    if (originalAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey
    }
  })

  it('reads NEXT_PUBLIC values directly and validates them before creating the browser client', async () => {
    const { createSupabaseBrowserClient } = await import('@/src/frontend/supabase/client')

    const client = createSupabaseBrowserClient()

    expect(parsePublicSupabaseEnvMock).toHaveBeenCalledWith({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })
    expect(createBrowserClientMock).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key')
    expect(client).toEqual({ kind: 'browser-client' })
  })
})
