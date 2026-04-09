import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { AUTH_COOKIE_NAME, hashSessionToken } from '@/src/backend/auth/session'
import type { AppRepository, UserRecord } from '@/src/backend/data/types'
import { ApiHttpError } from '@/src/backend/api/errors'

export type ApiVariables = {
  repository: AppRepository
  currentUserId: string
  currentUser: UserRecord
}

export const requireAuth = createMiddleware<{ Variables: ApiVariables }>(async (c, next) => {
  const rawSessionToken = getCookie(c, AUTH_COOKIE_NAME)

  if (!rawSessionToken) {
    throw new ApiHttpError(401, 'UNAUTHORIZED', 'Missing session')
  }

  const repository = c.get('repository')
  const sessionLookup = await repository.findSessionByTokenHash(hashSessionToken(rawSessionToken))

  if (!sessionLookup) {
    throw new ApiHttpError(401, 'UNAUTHORIZED', 'Session not found')
  }

  if (new Date(sessionLookup.session.expiresAt) <= new Date()) {
    await repository.deleteSessionByTokenHash(sessionLookup.session.tokenHash)
    throw new ApiHttpError(401, 'UNAUTHORIZED', 'Session expired')
  }

  c.set('currentUserId', sessionLookup.user.id)
  c.set('currentUser', sessionLookup.user)
  await next()
})
