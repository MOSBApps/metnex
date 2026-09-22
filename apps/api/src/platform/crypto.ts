import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(scryptCallback)

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scrypt(password, salt, 64)) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, expectedHex] = storedHash.split(':')
  if (!salt || !expectedHex) return false

  const derived = (await scrypt(password, salt, 64)) as Buffer
  const expected = Buffer.from(expectedHex, 'hex')
  if (derived.length !== expected.length) return false

  return timingSafeEqual(derived, expected)
}

export function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex')
}
