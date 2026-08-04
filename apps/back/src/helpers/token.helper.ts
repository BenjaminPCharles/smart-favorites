import { Buffer } from 'node:buffer'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Auth tokens are `base64url(publicId:secret)`.
 *
 * The secret is 256 bits of CSPRNG output, so there is no dictionary to try and
 * no need for a slow password KDF: a plain SHA-256 is pre-image resistant
 * against a database leak, and costs microseconds instead of ~100ms + 64MB.
 * See AUTH.md for the full rationale.
 */

const SECRET_BYTES = 32
const TOKEN_SEPARATOR = ':'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface DecodedToken {
  publicId: string
  secret: string
}

/**
 * Generate a new token secret.
 * @return {string} 256 bits of randomness, base64url encoded
 */
export function generateSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url')
}

/**
 * Encode a public id and a secret into a single bearer token.
 * base64url keeps the token free of `+`, `/` and `=`, which matters because the
 * user copies it by hand as their recovery key.
 * @param publicId
 * @param secret
 * @return {string}
 */
export function encodeToken(publicId: string, secret: string): string {
  return Buffer.from(`${publicId}${TOKEN_SEPARATOR}${secret}`).toString('base64url')
}

/**
 * Decode a bearer token back into its parts.
 * @param token
 * @return {DecodedToken | null} null when the token is malformed
 */
export function decodeToken(token: string): DecodedToken | null {
  const decoded = Buffer.from(token, 'base64url').toString('utf8')
  const separatorIndex = decoded.indexOf(TOKEN_SEPARATOR)
  if (separatorIndex <= 0) {
    return null
  }

  const publicId = decoded.slice(0, separatorIndex)
  const secret = decoded.slice(separatorIndex + 1)

  // publicId must be a uuid: it goes straight into a uuid column, and Postgres
  // raises on malformed input, which would surface as a 500 instead of a 401.
  if (!UUID_REGEX.test(publicId) || !secret) {
    return null
  }

  return { publicId, secret }
}

/**
 * Hash a token secret for storage.
 * @param secret
 * @return {string} hex encoded SHA-256
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/**
 * Compare a secret against a stored hash in constant time.
 * @param secret
 * @param storedHash
 * @return {boolean}
 */
export function verifySecret(secret: string, storedHash: string): boolean {
  const expected = Buffer.from(storedHash, 'hex')
  const actual = Buffer.from(hashSecret(secret), 'hex')

  // timingSafeEqual throws on length mismatch, which a corrupted row could cause
  if (expected.length !== actual.length) {
    return false
  }

  return timingSafeEqual(expected, actual)
}
