import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { consumeChallenge, issueChallenge, purgeExpiredChallenges } from './auth-challenge.helper'

/**
 * Build a pool stub. Only `query` is ever called by this helper.
 * @param result
 * @return {{ db: Pool, query: ReturnType<typeof vi.fn> }}
 */
function createDbStub(result: unknown): { db: Pool, query: ReturnType<typeof vi.fn> } {
  const query = vi.fn().mockResolvedValue(result)

  return { db: { query } as unknown as Pool, query }
}

describe('auth-challenge.helper', () => {
  describe('issueChallenge', () => {
    it('binds the nonce to the public key and the purpose', async () => {
      const expiresAt = new Date('2026-08-04T12:00:00Z')
      const { db, query } = createDbStub({ rows: [{ nonce: 'generated', expires_at: expiresAt }], rowCount: 1 })

      const issued = await issueChallenge(db, 'device-key', 'session')

      expect(issued).toEqual({ nonce: 'generated', expiresAt })

      const [sql, params] = query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('INSERT INTO auth_challenge')
      // The expiry is computed by the database, never from Date.now() — and the TTL
      // is bound as a parameter, not interpolated into the statement
      expect(sql).toContain('now() + make_interval(secs => $4)')
      expect(params[1]).toBe('device-key')
      expect(params[2]).toBe('session')
      expect(params[3]).toBe(60)
      // A fresh nonce, not one supplied by the caller
      expect(params[0]).toMatch(/^[\w-]{43}$/)
    })

    it('throws when the insert returns nothing', async () => {
      const { db } = createDbStub({ rows: [], rowCount: 0 })

      await expect(issueChallenge(db, 'device-key', 'session')).rejects.toThrow('Could not issue a challenge')
    })
  })

  describe('consumeChallenge', () => {
    it('enforces all four non-negotiable rules in one statement', async () => {
      const { db, query } = createDbStub({ rows: [{ nonce: 'n' }], rowCount: 1 })

      await consumeChallenge(db, 'n', 'device-key', 'session')

      // Four assertions on a SQL string, deliberately: these are the four rules
      // from the spec, and a refactor that drops one would otherwise pass silently.
      const [sql] = query.mock.calls[0] as [string]
      expect(sql).toContain('used_at IS NULL')
      expect(sql).toContain('expires_at > now()')
      expect(sql).toContain('public_key = $2')
      expect(sql).toContain('purpose = $3')
    })

    it('spends a nonce exactly once', async () => {
      const { db: spent } = createDbStub({ rows: [{ nonce: 'n' }], rowCount: 1 })
      const { db: refused } = createDbStub({ rows: [], rowCount: 0 })
      const { db: nullCount } = createDbStub({ rows: [], rowCount: null })

      expect(await consumeChallenge(spent, 'n', 'k', 'session')).toBe(true)
      expect(await consumeChallenge(refused, 'n', 'k', 'session')).toBe(false)
      expect(await consumeChallenge(nullCount, 'n', 'k', 'session')).toBe(false)
    })
  })

  it('purges only rows that can no longer be spent', async () => {
    const { db, query } = createDbStub({ rows: [], rowCount: 7 })

    expect(await purgeExpiredChallenges(db)).toBe(7)
    expect(query.mock.calls[0]?.[0]).toContain('DELETE FROM auth_challenge')
  })
})
