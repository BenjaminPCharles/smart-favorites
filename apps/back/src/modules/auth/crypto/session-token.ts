import { Buffer } from 'node:buffer'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const TOKEN_BYTES = 32

export const SESSION_TTL_SECONDS = 900
export const CHALLENGE_TTL_SECONDS = 60
export const NONCE_BYTES = TOKEN_BYTES

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function generateNonce(): string {
  return randomBytes(NONCE_BYTES).toString('base64url')
}

/**
 * Hex encoded SHA-256, this is what goes in the database.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Constant-time compare of a token against its stored hash, kept because it is free.
 */
export function sessionTokenMatchesHash(token: string, storedHash: string): boolean {
  const expected = Buffer.from(storedHash, 'hex')
  const actual = Buffer.from(hashSessionToken(token), 'hex')

  /**
   * timingSafeEqual throws on a length mismatch, a corrupted row would do it
   */
  if (expected.length !== actual.length) {
    return false
  }

  return timingSafeEqual(expected, actual)
}
