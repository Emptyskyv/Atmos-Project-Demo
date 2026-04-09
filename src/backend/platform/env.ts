import { z } from 'zod'
import { parseOpenAIRequestHeaders } from '@/src/backend/agent/openai-endpoint'

function emptyStringToUndefined(value: unknown) {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim()

  return normalized === '' || normalized === 'undefined' ? undefined : value
}

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  VERCEL_TOKEN: z.string().min(1),
  VERCEL_TEAM_ID: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.preprocess(emptyStringToUndefined, z.url().optional()),
  OPENAI_RESPONSES_URL: z.preprocess(emptyStringToUndefined, z.url().optional()),
  OPENAI_RUNTIME: z.preprocess(emptyStringToUndefined, z.enum(['auto', 'agents', 'compat']).default('auto')),
  OPENAI_REQUEST_HEADERS: z.preprocess(
    (value) => {
      const normalized = emptyStringToUndefined(value)

      if (typeof normalized === 'undefined') {
        return undefined
      }

      return parseOpenAIRequestHeaders(normalized as string)
    },
    z.record(z.string(), z.string()).optional(),
  ),
  OPENAI_MODEL: z.string().min(1),
  PUBLISH_DAILY_LIMIT_PER_USER: z.coerce.number().int().positive().default(5),
  RUN_MAX_STEPS: z.coerce.number().int().positive().default(20),
  SNAPSHOT_MAX_SIZE_MB: z.coerce.number().int().positive().default(10),
})

const publicSupabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>
export type PublicSupabaseEnv = z.infer<typeof publicSupabaseEnvSchema>

export function parseServerEnv(input: Record<string, string | undefined>) {
  return serverEnvSchema.parse(input)
}

export function parsePublicSupabaseEnv(input: Record<string, string | undefined>) {
  return publicSupabaseEnvSchema.parse(input)
}

let cachedServerEnv: ServerEnv | undefined
let cachedPublicSupabaseEnv: PublicSupabaseEnv | undefined

function getServerEnv() {
  if (!cachedServerEnv) {
    cachedServerEnv = parseServerEnv(process.env)
  }

  return cachedServerEnv
}

function getPublicSupabaseEnv() {
  if (!cachedPublicSupabaseEnv) {
    cachedPublicSupabaseEnv = parsePublicSupabaseEnv(process.env)
  }

  return cachedPublicSupabaseEnv
}

export const serverEnv = new Proxy({} as ServerEnv, {
  get(_target, property) {
    return getServerEnv()[property as keyof ServerEnv]
  },
})

export const publicSupabaseEnv = new Proxy({} as PublicSupabaseEnv, {
  get(_target, property) {
    return getPublicSupabaseEnv()[property as keyof PublicSupabaseEnv]
  },
})

export function resetEnvCaches() {
  cachedServerEnv = undefined
  cachedPublicSupabaseEnv = undefined
}
