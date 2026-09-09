import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { consumeChallenge, issueChallenge, purgeExpiredChallenges } from '../../modules/auth/auth.repository'

/** Builds a pool stub. The repository only ever calls `query`. */
function createDbStub(result: unknown): { db: Pool, query: ReturnType<typeof vi.fn> } {
  const query = vi.fn().mockResolvedValue(result)

  return { db: { query } as unknown as Pool, query }
}

describe('SUCCESS', () => {
  it('issueChallenge binds the nonce to the public key and the purpose', async () => {
    const expiresAt = new Date('2026-08-04T12:00:00Z')
    const { db, query } = createDbStub({ rows: [{ nonce: 'generated', expires_at: expiresAt }], rowCount: 1 })

    const issued = await issueChallenge(db, 'device-key', 'session')

    expect(issued).toEqual({ nonce: 'generated', expiresAt })

    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('INSERT INTO auth_challenge')
    expect(sql).toContain('now() + make_interval(secs => $4)')
    expect(params[1]).toBe('device-key')
    expect(params[2]).toBe('session')
    expect(params[3]).toBe(60)
    expect(params[0]).toMatch(/^[\w-]{43}$/)
  })

  it('consumeChallenge enforces all four non-negotiable rules in one statement', async () => {
    const { db, query } = createDbStub({ rows: [{ nonce: 'n' }], rowCount: 1 })

    await consumeChallenge(db, 'n', 'device-key', 'session')

    const [sql] = query.mock.calls[0] as [string]
    expect(sql).toContain('used_at IS NULL')
    expect(sql).toContain('expires_at > now()')
    expect(sql).toContain('public_key = $2')
    expect(sql).toContain('purpose = $3')
  })

  it('consumeChallenge spends a nonce that matches every rule', async () => {
    const { db } = createDbStub({ rows: [{ nonce: 'n' }], rowCount: 1 })

    expect(await consumeChallenge(db, 'n', 'k', 'session')).toBe(true)
  })

  it('purgeExpiredChallenges purges only rows that can no longer be spent', async () => {
    const { db, query } = createDbStub({ rows: [], rowCount: 7 })

    expect(await purgeExpiredChallenges(db)).toBe(7)
    expect(query.mock.calls[0]?.[0]).toContain('DELETE FROM auth_challenge')
  })
})

describe('ERROR', () => {
  it('issueChallenge throws when the insert returns nothing', async () => {
    const { db } = createDbStub({ rows: [], rowCount: 0 })

    await expect(issueChallenge(db, 'device-key', 'session')).rejects.toThrow('Could not issue a challenge')
  })

  it('consumeChallenge refuses a nonce no row matches', async () => {
    const { db } = createDbStub({ rows: [], rowCount: 0 })

    expect(await consumeChallenge(db, 'n', 'k', 'session')).toBe(false)
  })

  it('consumeChallenge refuses a nonce when the driver reports no row count', async () => {
    const { db } = createDbStub({ rows: [], rowCount: null })

    expect(await consumeChallenge(db, 'n', 'k', 'session')).toBe(false)
  })
})
