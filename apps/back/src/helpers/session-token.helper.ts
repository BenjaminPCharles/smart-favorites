import { Buffer } from 'node:buffer'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Tokens and nonces are opaque 32-byte CSPRNG values, looked up by hash. 256 bits
 * means no dictionary to try, so plain SHA-256 instead of a slow password KDF:
 * pre-image resistant against a leak, microseconds instead of ~100ms + 64MB.
 */

const TOKEN_BYTES = 32

/** 15 min. Short costs nothing, the extension renews by signing a challenge. */
export const SESSION_TTL_SECONDS = 900
/** 60s. Clients redeem a nonce within milliseconds of getting it. */
export const CHALLENGE_TTL_SECONDS = 60
export const NONCE_BYTES = TOKEN_BYTES

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function generateNonce(): string {
  return randomBytes(NONCE_BYTES).toString('base64url')
}

/** Hex encoded SHA-256, this is what goes in the database. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Mostly ceremonial: the hash is the indexed lookup key and Postgres btree
 * comparison isn't constant time, so the guarantee breaks where it matters. The
 * entropy and hashing at rest are the real controls. Kept because it's free.
 */
export function sessionTokenMatchesHash(token: string, storedHash: string): boolean {
  const expected = Buffer.from(storedHash, 'hex')
  const actual = Buffer.from(hashSessionToken(token), 'hex')

  // timingSafeEqual throws on a length mismatch, a corrupted row would do it
  if (expected.length !== actual.length) {
    return false
  }

  return timingSafeEqual(expected, actual)
}
