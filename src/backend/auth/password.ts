import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const SCRYPT_KEY_LENGTH = 64
const scryptAsync = promisify(scrypt)

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = (await scryptAsync(password, salt, SCRYPT_KEY_LENGTH)) as Buffer
  return `scrypt$${salt}$${derivedKey.toString('hex')}`
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, expectedKey] = passwordHash.split('$')

  if (algorithm !== 'scrypt' || !salt || !expectedKey) {
    return false
  }

  const candidateKey = (await scryptAsync(password, salt, SCRYPT_KEY_LENGTH)) as Buffer
  return timingSafeEqual(candidateKey, Buffer.from(expectedKey, 'hex'))
}
