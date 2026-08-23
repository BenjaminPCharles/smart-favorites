import { Buffer } from 'node:buffer'

/**
 * Buffer.from(v, 'base64url') ignores unused trailing bits, so 'A'.repeat(43) and
 * 'A'.repeat(42) + 'B' both decode to 32 zero bytes and z.base64url() takes both.
 * Rejected rather than rewritten: the signed message holds the string as sent.
 */
export function decodeCanonicalBase64url(value: string, expectedBytes: number): Buffer | null {
  const decoded = Buffer.from(value, 'base64url')
  if (decoded.length !== expectedBytes || decoded.toString('base64url') !== value) {
    return null
  }

  return decoded
}
