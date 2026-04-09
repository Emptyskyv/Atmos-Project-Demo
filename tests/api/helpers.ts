import type { AgentRuntime } from '@/src/backend/agent/runtime'
import type { PublishService } from '@/src/backend/publish/deploy'
import { buildApiApp } from '@/src/backend/api/app'
import { createMemoryRepository } from '@/src/backend/data/memory'
import type { AppRepository } from '@/src/backend/data/types'

type BuildAuthedAppArgs = {
  repository?: AppRepository
  runtime?: AgentRuntime
  publish?: PublishService
  runState?: {
    hasActiveRun?: (projectId: string) => boolean
  }
  publishState?: {
    countForToday?: (userId: string) => number
  }
}

export function createTestRepository() {
  return createMemoryRepository()
}

export async function registerAndGetSessionCookie(
  app: { request: (input: string, init?: RequestInit) => Promise<Response> },
  input: { email?: string; password?: string } = {},
) {
  const response = await app.request('/auth/register', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email ?? 'user@example.com',
      password: input.password ?? 'password123',
    }),
  })

  const setCookie = response.headers.get('set-cookie')

  if (!setCookie) {
    throw new Error('Missing set-cookie header on auth/register')
  }

  return setCookie.split(';')[0]
}

export async function buildAuthedApp(args: BuildAuthedAppArgs = {}) {
  const repository = args.repository ?? createTestRepository()
  const app = buildApiApp({
    ...args,
    repository,
  })
  const cookie = await registerAndGetSessionCookie(app, {
    email: 'test@example.com',
    password: 'strong-password-123',
  })

  return {
    app,
    cookie,
    repository,
  }
}
