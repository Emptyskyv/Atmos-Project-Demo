import { handle } from 'hono/vercel'
import { describe, expect, it } from 'vitest'
import { buildApiApp } from '@/src/backend/api/app'
import { createTestRepository } from '@/tests/api/helpers'

describe('auth routes', () => {
  it('registers a user, sets a session cookie, and returns /auth/me', async () => {
    const app = buildApiApp({ repository: createTestRepository() })

    const registerRes = await app.request('/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'password123',
      }),
    })

    expect(registerRes.status).toBe(200)
    expect(registerRes.headers.get('set-cookie')).toContain('atoms_session=')

    const meRes = await app.request('/auth/me', {
      headers: {
        cookie: registerRes.headers.get('set-cookie')?.split(';')[0] ?? '',
      },
    })

    expect(meRes.status).toBe(200)

    const body = await meRes.json()
    expect(body.user.email).toBe('owner@example.com')
  })

  it('logs in an existing user and clears the cookie on logout', async () => {
    const app = buildApiApp({ repository: createTestRepository() })

    await app.request('/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'password123',
      }),
    })

    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'password123',
      }),
    })

    expect(loginRes.status).toBe(200)

    const logoutRes = await app.request('/auth/logout', {
      method: 'POST',
      headers: {
        cookie: loginRes.headers.get('set-cookie')?.split(';')[0] ?? '',
      },
    })

    expect(logoutRes.status).toBe(204)
    expect(logoutRes.headers.get('set-cookie')).toContain('atoms_session=')
  })

  it('registers correctly through the real /api-prefixed route path', async () => {
    const handler = handle(buildApiApp({ repository: createTestRepository() }))

    const registerRes = await handler(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'prefixed@example.com',
          password: 'password123',
        }),
      }),
    )

    expect(registerRes.status).toBe(200)
    expect(registerRes.headers.get('set-cookie')).toContain('atoms_session=')

    const meRes = await handler(
      new Request('http://localhost/api/auth/me', {
        headers: {
          cookie: registerRes.headers.get('set-cookie')?.split(';')[0] ?? '',
        },
      }),
    )

    expect(meRes.status).toBe(200)
  })
})
