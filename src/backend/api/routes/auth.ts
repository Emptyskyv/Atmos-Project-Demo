import { zValidator } from '@hono/zod-validator'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ApiVariables } from '@/src/backend/api/context'
import { hashPassword, verifyPassword } from '@/src/backend/auth/password'
import {
  AUTH_COOKIE_NAME,
  createSessionExpiryDate,
  createSessionToken,
  hashSessionToken,
} from '@/src/backend/auth/session'
import { ApiHttpError } from '@/src/backend/api/errors'

const credentialsSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
})

function writeSessionCookie(c: { req: unknown; res: unknown }, token: string, expiresAt: Date) {
  setCookie(c as never, AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    secure: process.env.NODE_ENV === 'production',
  })
}

export const authRoutes = new Hono<{ Variables: ApiVariables }>()
  .post('/register', zValidator('json', credentialsSchema), async (c) => {
    const repository = c.get('repository')
    const body = c.req.valid('json')
    const existingUser = await repository.findUserByEmail(body.email)

    if (existingUser) {
      throw new ApiHttpError(409, 'EMAIL_IN_USE', 'Email already registered')
    }

    const user = await repository.createUser({
      email: body.email,
      passwordHash: await hashPassword(body.password),
    })

    const sessionToken = createSessionToken()
    const expiresAt = createSessionExpiryDate()

    await repository.createSession({
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt: expiresAt.toISOString(),
    })

    writeSessionCookie(c, sessionToken, expiresAt)

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: null,
        createdAt: user.createdAt,
      },
    })
  })
  .post('/login', zValidator('json', credentialsSchema), async (c) => {
    const repository = c.get('repository')
    const body = c.req.valid('json')
    const user = await repository.findUserByEmail(body.email)

    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new ApiHttpError(401, 'UNAUTHORIZED', 'Invalid email or password')
    }

    const sessionToken = createSessionToken()
    const expiresAt = createSessionExpiryDate()

    await repository.createSession({
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt: expiresAt.toISOString(),
    })

    writeSessionCookie(c, sessionToken, expiresAt)

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: null,
        createdAt: user.createdAt,
      },
    })
  })
  .post('/logout', async (c) => {
    const repository = c.get('repository')
    const rawSessionToken = getCookie(c, AUTH_COOKIE_NAME)

    if (rawSessionToken) {
      await repository.deleteSessionByTokenHash(hashSessionToken(rawSessionToken))
    }

    deleteCookie(c, AUTH_COOKIE_NAME, {
      path: '/',
    })

    return c.body(null, 204)
  })
  .get('/me', async (c) => {
    const repository = c.get('repository')
    const rawSessionToken = getCookie(c, AUTH_COOKIE_NAME)

    if (!rawSessionToken) {
      throw new ApiHttpError(401, 'UNAUTHORIZED', 'Missing session')
    }

    const sessionLookup = await repository.findSessionByTokenHash(hashSessionToken(rawSessionToken))

    if (!sessionLookup) {
      throw new ApiHttpError(401, 'UNAUTHORIZED', 'Session not found')
    }

    if (new Date(sessionLookup.session.expiresAt) <= new Date()) {
      await repository.deleteSessionByTokenHash(sessionLookup.session.tokenHash)
      throw new ApiHttpError(401, 'UNAUTHORIZED', 'Session expired')
    }

    return c.json({
      user: {
        id: sessionLookup.user.id,
        email: sessionLookup.user.email,
        name: null,
        createdAt: sessionLookup.user.createdAt,
      },
    })
  })
