import OpenAI from 'openai'
import type { ModelSettings } from '@openai/agents'

export type OpenAIRuntimeMode = 'agents' | 'compat'
export type OpenAIRuntimePreference = OpenAIRuntimeMode | 'auto'

type OpenAIGatewayEnv = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL?: string
  OPENAI_RESPONSES_URL?: string
  OPENAI_RUNTIME?: OpenAIRuntimePreference
  OPENAI_REQUEST_HEADERS?: Record<string, string> | string
}

type NormalizedResponsesEndpoint = {
  baseURL: string
  defaultQuery?: Record<string, string>
}

type ProviderConnectionOptions = {
  apiKey?: string
  baseURL?: string
  openAIClient?: OpenAI
}

type ProviderConfig = ProviderConnectionOptions & {
  useResponses: boolean
  useResponsesWebSocket?: boolean
}

export type OpenAICompatibleConfig = {
  apiKey: string
  baseURL: string
  defaultQuery?: Record<string, string>
  headers?: Record<string, string>
}

const RESPONSES_PATH_PATTERN = /\/responses$/i

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  )
}

export function parseOpenAIRequestHeaders(
  value: Record<string, string> | string | undefined,
): Record<string, string> | undefined {
  if (typeof value === 'undefined') {
    return undefined
  }

  if (isStringRecord(value)) {
    return value
  }

  if (typeof value !== 'string') {
    throw new Error('OPENAI_REQUEST_HEADERS must be a JSON object of string header values')
  }

  const trimmed = value.trim()

  if (trimmed.length === 0) {
    return undefined
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('OPENAI_REQUEST_HEADERS must be a JSON object of string header values')
  }

  if (!isStringRecord(parsed)) {
    throw new Error('OPENAI_REQUEST_HEADERS must be a JSON object of string header values')
  }

  return parsed
}

export function normalizeResponsesEndpointUrl(
  endpointUrl: string,
): NormalizedResponsesEndpoint {
  const endpoint = new URL(endpointUrl)
  const normalizedPath = endpoint.pathname.replace(/\/+$/, '')
  const match = normalizedPath.match(RESPONSES_PATH_PATTERN)

  if (!match || typeof match.index !== 'number') {
    throw new Error('OPENAI_RESPONSES_URL must point to an OpenAI-compatible /responses endpoint')
  }

  const basePath = normalizedPath.slice(0, match.index)
  const baseURL = `${endpoint.origin}${basePath}`
  const defaultQuery =
    endpoint.search.length > 0 ? Object.fromEntries(endpoint.searchParams.entries()) : undefined

  return {
    baseURL,
    defaultQuery,
  }
}

export function buildOpenAICompatibleConfig(
  env: OpenAIGatewayEnv,
): OpenAICompatibleConfig {
  const headers = parseOpenAIRequestHeaders(env.OPENAI_REQUEST_HEADERS)

  if (env.OPENAI_BASE_URL) {
    return {
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL,
      headers,
    }
  }

  if (env.OPENAI_RESPONSES_URL) {
    const { baseURL, defaultQuery } = normalizeResponsesEndpointUrl(env.OPENAI_RESPONSES_URL)

    return {
      apiKey: env.OPENAI_API_KEY,
      baseURL,
      defaultQuery,
      headers,
    }
  }

  return {
    apiKey: env.OPENAI_API_KEY,
    baseURL: 'https://api.openai.com/v1',
    headers,
  }
}

export function resolveOpenAiChatEndpointConfig(
  env: OpenAIGatewayEnv,
): OpenAICompatibleConfig {
  return buildOpenAICompatibleConfig(env)
}

export function resolveOpenAIRuntimeMode(
  env: Pick<OpenAIGatewayEnv, 'OPENAI_RUNTIME' | 'OPENAI_BASE_URL' | 'OPENAI_RESPONSES_URL'>,
): OpenAIRuntimeMode {
  if (env.OPENAI_RUNTIME === 'agents') {
    return 'agents'
  }

  if (env.OPENAI_RUNTIME === 'compat') {
    return 'compat'
  }

  return env.OPENAI_BASE_URL || env.OPENAI_RESPONSES_URL ? 'compat' : 'agents'
}

export function buildOpenAIProviderOptions(
  env: OpenAIGatewayEnv,
): ProviderConnectionOptions {
  const headers = parseOpenAIRequestHeaders(env.OPENAI_REQUEST_HEADERS)

  if (env.OPENAI_BASE_URL) {
    if (headers) {
      return {
        openAIClient: new OpenAI({
          apiKey: env.OPENAI_API_KEY,
          baseURL: env.OPENAI_BASE_URL,
          defaultHeaders: headers,
        }),
      }
    }

    return {
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL,
    }
  }

  if (env.OPENAI_RESPONSES_URL) {
    const { baseURL, defaultQuery } = normalizeResponsesEndpointUrl(env.OPENAI_RESPONSES_URL)

    return {
      openAIClient: new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        baseURL,
        defaultQuery,
        defaultHeaders: headers,
      }),
    }
  }

  if (headers) {
    return {
      openAIClient: new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        defaultHeaders: headers,
      }),
    }
  }

  return {
    apiKey: env.OPENAI_API_KEY,
  }
}

export function buildOpenAIProviderConfig(env: OpenAIGatewayEnv): ProviderConfig {
  const useResponses =
    env.OPENAI_RUNTIME === 'agents' || typeof env.OPENAI_RESPONSES_URL === 'string'

  return {
    ...buildOpenAIProviderOptions(env),
    useResponses,
    useResponsesWebSocket: false,
  }
}

export function buildOpenAIModelSettings(
  env: Pick<OpenAIGatewayEnv, 'OPENAI_REQUEST_HEADERS'>,
): ModelSettings | undefined {
  const headers = parseOpenAIRequestHeaders(env.OPENAI_REQUEST_HEADERS)

  if (!headers) {
    return undefined
  }

  return {
    providerData: {
      extraHeaders: headers,
    },
  }
}
