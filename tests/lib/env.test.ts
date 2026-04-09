import { describe, expect, it } from 'vitest'
import { parsePublicSupabaseEnv, parseServerEnv } from '@/src/backend/platform/env'

describe('parseServerEnv', () => {
  const baseServerEnv = {
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/atoms?schema=public',
    VERCEL_TOKEN: 'vercel-token',
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'gpt-5.2',
  }

  it('accepts configurable OpenAI-compatible model ids', () => {
    expect(
      parseServerEnv({
        ...baseServerEnv,
        OPENAI_MODEL: 'gpt-5.3-codex',
      }),
    ).toMatchObject({
      OPENAI_MODEL: 'gpt-5.3-codex',
    })
  })

  it('requires OPENAI_MODEL to be non-empty', () => {
    expect(() =>
      parseServerEnv({
        ...baseServerEnv,
        OPENAI_MODEL: '',
      }),
    ).toThrow(/OPENAI_MODEL/)
  })

  it('requires DATABASE_URL', () => {
    expect(() =>
      parseServerEnv({
        VERCEL_TOKEN: 'vercel-token',
        OPENAI_API_KEY: 'sk-test',
        OPENAI_MODEL: 'gpt-5.2',
      }),
    ).toThrow(/DATABASE_URL/)
  })

  it('requires other mandatory server env values', () => {
    expect(() =>
      parseServerEnv({
        ...baseServerEnv,
        OPENAI_API_KEY: undefined,
      }),
    ).toThrow(/OPENAI_API_KEY/)
  })

  it('applies numeric defaults and coerces numeric strings', () => {
    expect(
      parseServerEnv({
        ...baseServerEnv,
        RUN_MAX_STEPS: '30',
      }),
    ).toMatchObject({
      PUBLISH_DAILY_LIMIT_PER_USER: 5,
      RUN_MAX_STEPS: 30,
      SNAPSHOT_MAX_SIZE_MB: 10,
    })
  })

  it('accepts an optional OPENAI_BASE_URL for proxy gateways', () => {
    expect(
      parseServerEnv({
        ...baseServerEnv,
        OPENAI_BASE_URL: 'https://gateway.example.com/v1',
      }),
    ).toMatchObject({
      OPENAI_BASE_URL: 'https://gateway.example.com/v1',
    })
  })

  it('accepts an optional OPENAI_RESPONSES_URL for response-compatible gateways', () => {
    expect(
      parseServerEnv({
        ...baseServerEnv,
        OPENAI_RESPONSES_URL: 'https://gateway.example.com/openai/v1/responses',
      }),
    ).toMatchObject({
      OPENAI_RESPONSES_URL: 'https://gateway.example.com/openai/v1/responses',
    })
  })

  it('treats an empty VERCEL_TEAM_ID as unset', () => {
    expect(
      parseServerEnv({
        ...baseServerEnv,
        VERCEL_TEAM_ID: '',
      }),
    ).toMatchObject({
      VERCEL_TEAM_ID: undefined,
    })
  })

  it('treats an empty OPENAI_BASE_URL as unset', () => {
    expect(
      parseServerEnv({
        ...baseServerEnv,
        OPENAI_BASE_URL: '',
      }),
    ).toMatchObject({
      OPENAI_BASE_URL: undefined,
    })
  })

  it('treats an empty OPENAI_RESPONSES_URL as unset', () => {
    expect(
      parseServerEnv({
        ...baseServerEnv,
        OPENAI_RESPONSES_URL: '',
      }),
    ).toMatchObject({
      OPENAI_RESPONSES_URL: undefined,
    })
  })

  it('treats the string literal undefined as unset for optional gateway env values', () => {
    expect(
      parseServerEnv({
        ...baseServerEnv,
        OPENAI_BASE_URL: 'undefined',
        OPENAI_RESPONSES_URL: 'undefined',
        OPENAI_RUNTIME: 'undefined',
      }),
    ).toMatchObject({
      OPENAI_BASE_URL: undefined,
      OPENAI_RESPONSES_URL: undefined,
      OPENAI_RUNTIME: 'auto',
    })
  })

  it('accepts an optional OPENAI_RUNTIME mode override', () => {
    expect(
      parseServerEnv({
        ...baseServerEnv,
        OPENAI_RUNTIME: 'compat',
      }),
    ).toMatchObject({
      OPENAI_RUNTIME: 'compat',
    })
  })

  it('accepts optional OPENAI_REQUEST_HEADERS as JSON', () => {
    expect(
      parseServerEnv({
        ...baseServerEnv,
        OPENAI_REQUEST_HEADERS: '{"HTTP-Referer":"https://opencode.ai/","X-Title":"opencode"}',
      }),
    ).toMatchObject({
      OPENAI_REQUEST_HEADERS: {
        'HTTP-Referer': 'https://opencode.ai/',
        'X-Title': 'opencode',
      },
    })
  })

  it('rejects invalid OPENAI_REQUEST_HEADERS JSON', () => {
    expect(() =>
      parseServerEnv({
        ...baseServerEnv,
        OPENAI_REQUEST_HEADERS: '{not-json}',
      }),
    ).toThrow(/OPENAI_REQUEST_HEADERS/)
  })
})

describe('parsePublicSupabaseEnv', () => {
  it('requires the public Supabase URL and anon key', () => {
    expect(() =>
      parsePublicSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })

  it('parses valid public Supabase env', () => {
    expect(
      parsePublicSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      }),
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })
  })
})
