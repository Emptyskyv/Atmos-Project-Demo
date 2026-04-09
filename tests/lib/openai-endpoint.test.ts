// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  buildOpenAICompatibleConfig,
  buildOpenAIModelSettings,
  buildOpenAIProviderConfig,
  buildOpenAIProviderOptions,
  normalizeResponsesEndpointUrl,
  parseOpenAIRequestHeaders,
  resolveOpenAIRuntimeMode,
} from '@/src/backend/agent/openai-endpoint'

describe('normalizeResponsesEndpointUrl', () => {
  it('converts a full responses endpoint into an OpenAI base URL', () => {
    expect(
      normalizeResponsesEndpointUrl('https://gateway.example.com/openai/v1/responses'),
    ).toEqual({
      baseURL: 'https://gateway.example.com/openai/v1',
      defaultQuery: undefined,
    })
  })

  it('preserves query params for gateways that require them on the responses endpoint', () => {
    expect(
      normalizeResponsesEndpointUrl(
        'https://gateway.example.com/openai/v1/responses?api-version=2025-04-01&tenant=atoms',
      ),
    ).toEqual({
      baseURL: 'https://gateway.example.com/openai/v1',
      defaultQuery: {
        'api-version': '2025-04-01',
        tenant: 'atoms',
      },
    })
  })

  it('accepts a trailing slash on the responses endpoint', () => {
    expect(
      normalizeResponsesEndpointUrl('https://gateway.example.com/openai/v1/responses/'),
    ).toEqual({
      baseURL: 'https://gateway.example.com/openai/v1',
      defaultQuery: undefined,
    })
  })

  it('rejects a URL that does not point at a responses endpoint', () => {
    expect(() =>
      normalizeResponsesEndpointUrl('https://gateway.example.com/openai/v1/chat/completions'),
    ).toThrow(/OPENAI_RESPONSES_URL/)
  })
})

describe('buildOpenAIProviderOptions', () => {
  it('keeps OPENAI_BASE_URL as a plain provider baseURL', () => {
    const options = buildOpenAIProviderOptions({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_BASE_URL: 'https://gateway.example.com/v1',
      OPENAI_RESPONSES_URL: undefined,
    })

    expect(options.apiKey).toBe('sk-test')
    expect(options.baseURL).toBe('https://gateway.example.com/v1')
    expect(options.openAIClient).toBeUndefined()
  })

  it('turns a full responses endpoint into a custom OpenAI client', () => {
    const options = buildOpenAIProviderOptions({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_BASE_URL: undefined,
      OPENAI_RESPONSES_URL:
        'https://gateway.example.com/openai/v1/responses?api-version=2025-04-01',
    })

    expect(options.apiKey).toBeUndefined()
    expect(options.baseURL).toBeUndefined()
    expect(options.openAIClient?.baseURL).toBe('https://gateway.example.com/openai/v1')
    expect(options.openAIClient?.defaultQuery()).toEqual({
      'api-version': '2025-04-01',
    })
  })

  it('prefers OPENAI_BASE_URL when both gateway settings are present', () => {
    const options = buildOpenAIProviderOptions({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_BASE_URL: 'https://gateway.example.com/v1',
      OPENAI_RESPONSES_URL: 'https://gateway.example.com/proxy/v2/responses',
    })

    expect(options.baseURL).toBe('https://gateway.example.com/v1')
    expect(options.openAIClient).toBeUndefined()
  })
})

describe('buildOpenAIProviderConfig', () => {
  it('keeps the plain base URL while using responses mode when both gateway settings are present', () => {
    const config = buildOpenAIProviderConfig({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_BASE_URL: 'https://gateway.example.com/v1',
      OPENAI_RESPONSES_URL: 'https://gateway.example.com/v1/responses',
    })

    expect(config.useResponses).toBe(true)
    expect(config.baseURL).toBe('https://gateway.example.com/v1')
  })

  it('uses responses when agents runtime is explicitly selected for a gateway base URL', () => {
    const config = buildOpenAIProviderConfig({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_BASE_URL: 'https://gateway.example.com/v1',
      OPENAI_RESPONSES_URL: undefined,
      OPENAI_RUNTIME: 'agents',
    })

    expect(config.useResponses).toBe(true)
    expect(config.baseURL).toBe('https://gateway.example.com/v1')
  })

  it('uses responses when a full responses endpoint is configured', () => {
    const config = buildOpenAIProviderConfig({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_BASE_URL: undefined,
      OPENAI_RESPONSES_URL: 'https://gateway.example.com/openai/v1/responses',
    })

    expect(config.useResponses).toBe(true)
    expect(config.openAIClient?.baseURL).toBe('https://gateway.example.com/openai/v1')
  })
})

describe('resolveOpenAIRuntimeMode', () => {
  it('defaults to compat mode when a proxy base URL is configured', () => {
    expect(
      resolveOpenAIRuntimeMode({
        OPENAI_API_KEY: 'sk-test',
        OPENAI_BASE_URL: 'https://gateway.example.com/v1',
        OPENAI_RESPONSES_URL: undefined,
      }),
    ).toBe('compat')
  })

  it('defaults to agents mode when no gateway endpoint is configured', () => {
    expect(
      resolveOpenAIRuntimeMode({
        OPENAI_API_KEY: 'sk-test',
        OPENAI_BASE_URL: undefined,
        OPENAI_RESPONSES_URL: undefined,
      }),
    ).toBe('agents')
  })

  it('honors an explicit runtime override', () => {
    expect(
      resolveOpenAIRuntimeMode({
        OPENAI_API_KEY: 'sk-test',
        OPENAI_BASE_URL: 'https://gateway.example.com/v1',
        OPENAI_RESPONSES_URL: undefined,
        OPENAI_RUNTIME: 'agents',
      }),
    ).toBe('agents')
  })
})

describe('parseOpenAIRequestHeaders', () => {
  it('parses request headers from JSON', () => {
    expect(
      parseOpenAIRequestHeaders('{"HTTP-Referer":"https://opencode.ai/","X-Title":"opencode"}'),
    ).toEqual({
      'HTTP-Referer': 'https://opencode.ai/',
      'X-Title': 'opencode',
    })
  })

  it('rejects invalid header payloads', () => {
    expect(() => parseOpenAIRequestHeaders('["not-an-object"]')).toThrow(/OPENAI_REQUEST_HEADERS/)
  })
})

describe('buildOpenAICompatibleConfig', () => {
  it('derives a compat config from a responses endpoint and extra request headers', () => {
    expect(
      buildOpenAICompatibleConfig({
        OPENAI_API_KEY: 'sk-test',
        OPENAI_BASE_URL: undefined,
        OPENAI_RESPONSES_URL:
          'https://gateway.example.com/openai/v1/responses?api-version=2025-04-01',
        OPENAI_REQUEST_HEADERS: '{"X-Title":"opencode"}',
      }),
    ).toEqual({
      apiKey: 'sk-test',
      baseURL: 'https://gateway.example.com/openai/v1',
      defaultQuery: {
        'api-version': '2025-04-01',
      },
      headers: {
        'X-Title': 'opencode',
      },
    })
  })
})

describe('buildOpenAIModelSettings', () => {
  it('maps request headers into responses transport extraHeaders for the agents runtime', () => {
    expect(
      buildOpenAIModelSettings({
        OPENAI_API_KEY: 'sk-test',
        OPENAI_BASE_URL: 'https://www.openclaudecode.cn/v1',
        OPENAI_RESPONSES_URL: undefined,
        OPENAI_RUNTIME: 'agents',
        OPENAI_REQUEST_HEADERS:
          '{"Authorization":"Bearer sk-test","User-Agent":"codex_cli_rs/0.77.0 (Windows 10.0.26100; x86_64) WindowsTerminal"}',
      }),
    ).toEqual({
      providerData: {
        extraHeaders: {
          Authorization: 'Bearer sk-test',
          'User-Agent': 'codex_cli_rs/0.77.0 (Windows 10.0.26100; x86_64) WindowsTerminal',
        },
      },
    })
  })

  it('omits model settings when no extra request headers are configured', () => {
    expect(
      buildOpenAIModelSettings({
        OPENAI_API_KEY: 'sk-test',
        OPENAI_BASE_URL: 'https://www.openclaudecode.cn/v1',
        OPENAI_RESPONSES_URL: undefined,
      }),
    ).toBeUndefined()
  })
})
