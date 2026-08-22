import type { Pool } from 'pg'
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createTestPool, truncateAll } from './db.helper'

/** Self-test of the harness: the three assumptions every future database test rests on. */
describe.skipIf(!inject('dbReady'))('db.helper', () => {
  let db: Pool

  beforeEach(async () => {
    db ??= createTestPool()
    await truncateAll(db)
  })

  afterAll(async () => {
    await db?.end()
  })

  it('has applied the migrations', async () => {
    const { rows } = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    )

    expect(rows.map(row => row.tablename)).toEqual([
      'auth_challenge',
      'favorite',
      'favorite_chunk',
      'pgmigrations',
      'user',
      'user_device',
      'user_session',
    ])
  })

  it('serves pgvector 0.8.x, so hnsw.iterative_scan is available', async () => {
    // The version is an acceptance criterion of P0-1, and testing against a different one
    // would prove nothing about what production runs.
    const { rows } = await db.query<{ extversion: string }>(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
    )

    expect(rows[0]?.extversion).toMatch(/^0\.8\./)
  })

  it('empties every table and restarts the identity sequences', async () => {
    const inserted = await db.query<{ id: number }>(
      `INSERT INTO "user" (master_public_key) VALUES ('harness-probe') RETURNING id`,
    )
    expect(inserted.rows[0]?.id).toBe(1)

    await truncateAll(db)

    const { rows } = await db.query<{ count: string }>('SELECT count(*) FROM "user"')
    expect(rows[0]?.count).toBe('0')

    // RESTART IDENTITY: the next row is id 1 again, so no test can depend on an id left
    // over from another one.
    const reinserted = await db.query<{ id: number }>(
      `INSERT INTO "user" (master_public_key) VALUES ('harness-probe') RETURNING id`,
    )
    expect(reinserted.rows[0]?.id).toBe(1)
  })

  it('cascades the truncate through the foreign keys', async () => {
    // `favorite_chunk` references `favorite` which references `user`. A TRUNCATE without
    // CASCADE would error out here rather than clean up.
    const user = await db.query<{ id: number }>(
      `INSERT INTO "user" (master_public_key) VALUES ('cascade-probe') RETURNING id`,
    )
    const userId = user.rows[0]?.id
    const favorite = await db.query<{ id: number }>(
      `INSERT INTO favorite (user_id, url, title, category)
       VALUES ($1, 'https://example.com', 'Example', 'tools') RETURNING id`,
      [userId],
    )
    await db.query(
      `INSERT INTO favorite_chunk (favorite_id, user_id, content) VALUES ($1, $2, 'probe')`,
      [favorite.rows[0]?.id, userId],
    )

    await expect(truncateAll(db)).resolves.toBeUndefined()

    const { rows } = await db.query<{ count: string }>('SELECT count(*) FROM favorite_chunk')
    expect(rows[0]?.count).toBe('0')
  })
})
