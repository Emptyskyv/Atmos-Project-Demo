import { createHash, randomBytes } from 'node:crypto'

export const AUTH_COOKIE_NAME = 'atoms_session'
export const SESSION_TTL_DAYS = 30

export function createSessionToken() {
  return randomBytes(32).toString('hex')
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function createSessionExpiryDate() {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS)
  return expiresAt
}
