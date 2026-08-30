import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decodeCanonicalBase64url } from './base64url'

describe('base64url', () => {
  it('decodes a canonical 43-char string to 32 bytes', () => {
    const bytes = randomBytes(32)
    const decoded = decodeCanonicalBase64url(bytes.toString('base64url'), 32)

    expect(decoded).not.toBeNull()
    expect(decoded?.equals(bytes)).toBe(true)
  })

  it('rejects a non-canonical encoding of the right byte length', () => {
    // Both decode to the same 32 zero bytes, and z.base64url().length(43) takes
    // both. Regression test for the malleability that lets one keypair own two
    // accounts.
    expect(Buffer.from(`${'A'.repeat(42)}B`, 'base64url')).toHaveLength(32)
    expect(decodeCanonicalBase64url('A'.repeat(43), 32)).not.toBeNull()
    expect(decodeCanonicalBase64url(`${'A'.repeat(42)}B`, 32)).toBeNull()
  })

  it('rejects the wrong byte length', () => {
    expect(decodeCanonicalBase64url('A'.repeat(42), 32)).toBeNull()
    expect(decodeCanonicalBase64url('A'.repeat(44), 32)).toBeNull()
  })

  it('rejects standard base64 characters and padding', () => {
    const bytes = randomBytes(32)
    const standard = bytes.toString('base64')

    // Only meaningful if the sample happens to contain a non-url-safe char
    if (/[+/]/.test(standard)) {
      expect(decodeCanonicalBase64url(standard.replace(/=+$/, ''), 32)).toBeNull()
    }
    expect(decodeCanonicalBase64url(`${bytes.toString('base64url')}=`, 32)).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(decodeCanonicalBase64url('', 32)).toBeNull()
  })

  it('round-trips the two wire lengths this app uses', () => {
    for (const size of [32, 64, 91]) {
      const bytes = randomBytes(size)
      expect(decodeCanonicalBase64url(bytes.toString('base64url'), size)?.equals(bytes)).toBe(true)
    }
  })
})
