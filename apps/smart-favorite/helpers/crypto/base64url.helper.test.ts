import { describe, expect, it } from 'vitest'
import { base64UrlToBytes, bytesToBase64Url } from '~helpers/crypto/base64url.helper'

describe('base64url.helper', () => {
  it('round-trips every length residue mod 4', () => {
    for (const size of [0, 1, 2, 3, 32, 64, 91]) {
      const bytes = crypto.getRandomValues(new Uint8Array(size))
      expect([...base64UrlToBytes(bytesToBase64Url(bytes))]).toEqual([...bytes])
    }
  })

  it('never emits a character outside the base64url alphabet', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const encoded = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(91)))
      expect(encoded).toMatch(/^[\w-]+$/)
    }
  })

  it('encodes a locked vector', () => {
    expect(bytesToBase64Url(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8]))).toBe('AAECAwQFBgcI')
  })

  it('decodes unpadded input', () => {
    expect([...base64UrlToBytes('AAECAwQFBgcI')]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('produces the 43-char form the server expects for a 32-byte key', () => {
    expect(bytesToBase64Url(new Uint8Array(32))).toHaveLength(43)
    expect(bytesToBase64Url(new Uint8Array(91))).toHaveLength(122)
  })
})
