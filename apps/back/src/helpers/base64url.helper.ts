import { Buffer } from 'node:buffer'

/**
 * Decode a base64url string of a known byte length, rejecting any encoding that
 * is not canonical.
 *
 * `Buffer.from(value, 'base64url')` is lenient: it ignores the unused trailing
 * bits, so two different strings can decode to the same bytes — 'A'.repeat(43)
 * and 'A'.repeat(42) + 'B' both yield the same 32 zero bytes, and both pass
 * `z.base64url()`. Without this gate the same public key could be inserted twice
 * under two different strings, which the unique indexes would not catch.
 *
 * Re-encoding and comparing pins exactly one string per key. The input is
 * rejected rather than rewritten: the signed message embeds the string the client
 * sent, so canonicalising it server-side would break verification.
 * @param value
 * @param expectedBytes
 * @return {Buffer | null} null when the input is not canonical base64url of exactly `expectedBytes`
 */
export function decodeCanonicalBase64url(value: string, expectedBytes: number): Buffer | null {
  const decoded = Buffer.from(value, 'base64url')
  if (decoded.length !== expectedBytes || decoded.toString('base64url') !== value) {
    return null
  }

  return decoded
}
