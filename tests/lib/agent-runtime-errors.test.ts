import { describe, expect, it } from 'vitest'
import { formatAgentRuntimeError } from '@/src/backend/agent/runtime-errors'

describe('formatAgentRuntimeError', () => {
  it('keeps plain Error messages intact', () => {
    expect(formatAgentRuntimeError(new Error('Something failed'))).toBe('Something failed')
  })

  it('adds status and code details for upstream API errors', () => {
    expect(
      formatAgentRuntimeError({
        status: 401,
        code: 'invalid_api_key',
        message: 'Incorrect API key provided',
      }),
    ).toBe('OpenAI upstream error (401 invalid_api_key): Incorrect API key provided')
  })

  it('falls back to nested upstream error details when needed', () => {
    expect(
      formatAgentRuntimeError({
        status: 403,
        error: {
          code: 'forbidden',
          message: 'Gateway rejected the request',
        },
      }),
    ).toBe('OpenAI upstream error (403 forbidden): Gateway rejected the request')
  })
})
