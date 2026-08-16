import { Buffer } from 'node:buffer'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Session tokens and challenge nonces are both opaque 32-byte CSPRNG values,
 * base64url encoded. Nothing is encoded into them — a token carries no identity,
 * it is looked up by its hash.
 *
 * The token is 256 bits of CSPRNG output, so there is no dictionary to try and no
 * need for a slow password KDF: a plain SHA-256 is pre-image resistant against a
 * database leak and costs microseconds instead of ~100ms + 64MB per request. The
 * argument is stronger here than it was for the old eternal secret, because the
 * hashed value now lives for 15 minutes. See docs/AUTH.md.
 */

const TOKEN_BYTES = 32

/** 15 minutes. Short is free: the extension renews silently by signing a challenge. */
export const SESSION_TTL_SECONDS = 900
/** 60 seconds. A client redeems a nonce within milliseconds of receiving it. */
export const CHALLENGE_TTL_SECONDS = 60
export const NONCE_BYTES = TOKEN_BYTES

/**
 * Generate a session token.
 * @return {string} 256 bits of randomness, base64url encoded
 */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/**
 * Generate a challenge nonce.
 * @return {string} 256 bits of randomness, base64url encoded
 */
export function generateNonce(): string {
  return randomBytes(NONCE_BYTES).toString('base64url')
}

/**
 * Hash a session token for storage.
 * @param token
 * @return {string} hex encoded SHA-256
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Compare a token against a stored hash in constant time.
 *
 * Honest caveat, also recorded in docs/AUTH.md: this is largely ceremonial. The
 * hash is the indexed lookup key, and Postgres's btree comparison is not constant
 * time, so the guarantee does not hold at the boundary that matters. The real
 * controls are the 256 bits of entropy — nothing to grind — and hashing at rest.
 * Kept because it costs nothing and the rule is written down.
 * @param token
 * @param storedHash
 * @return {boolean}
 */
export function sessionTokenMatchesHash(token: string, storedHash: string): boolean {
  const expected = Buffer.from(storedHash, 'hex')
  const actual = Buffer.from(hashSessionToken(token), 'hex')

  // timingSafeEqual throws on length mismatch, which a corrupted row could cause
  if (expected.length !== actual.length) {
    return false
  }

  return timingSafeEqual(expected, actual)
}
