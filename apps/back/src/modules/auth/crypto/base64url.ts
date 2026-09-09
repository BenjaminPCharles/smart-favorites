import { Buffer } from 'node:buffer'

/**
 * Decodes base64url, rejecting the non-canonical encodings Buffer would silently accept.
 */
export function decodeCanonicalBase64url(value: string, expectedBytes: number): Buffer | null {
  const decoded = Buffer.from(value, 'base64url')
  if (decoded.length !== expectedBytes || decoded.toString('base64url') !== value) {
    return null
  }

  return decoded
}
