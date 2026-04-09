import { cookies } from 'next/headers'
import {
  AUTH_COOKIE_NAME,
  hashSessionToken,
} from '@/src/backend/auth/session'
import { createPrismaRepository } from '@/src/backend/data/prisma'

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(AUTH_COOKIE_NAME)?.value

  if (!sessionToken) {
    return null
  }

  const repository = createPrismaRepository()
  const sessionLookup = await repository.findSessionByTokenHash(hashSessionToken(sessionToken))

  if (!sessionLookup) {
    return null
  }

  if (new Date(sessionLookup.session.expiresAt) <= new Date()) {
    await repository.deleteSessionByTokenHash(sessionLookup.session.tokenHash)
    return null
  }

  return sessionLookup.user
}
