import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  generateNonce,
  generateSessionToken,
  hashSessionToken,
  sessionTokenMatchesHash,
} from './session-token'

describe('session-token', () => {
  it('generates 32 bytes of base64url, never twice the same', () => {
    const token = generateSessionToken()

    expect(token).toHaveLength(43)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    expect(token).not.toBe(generateSessionToken())
    expect(generateNonce()).not.toBe(generateNonce())
  })

  it('hashes to deterministic lowercase hex', () => {
    const token = generateSessionToken()

    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashSessionToken(token)).toBe(hashSessionToken(token))
    expect(hashSessionToken(token)).not.toBe(hashSessionToken(generateSessionToken()))
  })

  it('matches a token against its own hash and nothing else', () => {
    const token = generateSessionToken()

    expect(sessionTokenMatchesHash(token, hashSessionToken(token))).toBe(true)
    expect(sessionTokenMatchesHash(generateSessionToken(), hashSessionToken(token))).toBe(false)
  })

  it('returns false rather than throwing on a corrupted stored hash', () => {
    // timingSafeEqual throws on a length mismatch, the length guard catches it
    const token = generateSessionToken()

    expect(sessionTokenMatchesHash(token, 'deadbeef')).toBe(false)
    expect(sessionTokenMatchesHash(token, '')).toBe(false)
    expect(sessionTokenMatchesHash(token, 'not hex at all')).toBe(false)
  })
})
