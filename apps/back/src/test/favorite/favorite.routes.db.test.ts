import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import process from 'node:process'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { generateSessionToken, hashSessionToken, SESSION_TTL_SECONDS } from '../../modules/auth/crypto/session-token'
import { createTestPool, testDatabaseConfig, truncateAll } from '../db.helper'

/** The wiring, not the SQL: that `request.user.id` is set by the time the handler runs. */
describe.skipIf(!inject('dbReady'))('favoriteRoutes, POST /favorites', () => {
  let db: Pool
  let app: FastifyInstance

  const body = {
    url: 'https://example.com/article',
    title: 'Example',
    content: 'page text',
  }

  /** The app builds its own pool from SERVICE_DB_*, so point those at the throwaway database. */
  beforeAll(async () => {
    process.env.SERVICE_DB_HOST = String(testDatabaseConfig.host)
    process.env.SERVICE_DB_PORT = String(testDatabaseConfig.port)
    process.env.SERVICE_DB_USER = String(testDatabaseConfig.user)
    process.env.SERVICE_DB_PASSWORD = String(testDatabaseConfig.password)
    process.env.SERVICE_DB_NAME = String(testDatabaseConfig.database)

    const { buildApp } = await import('../../app')
    app = await buildApp({ logger: false })
    await app.ready()
    db = createTestPool()
  })

  beforeEach(async () => {
    await truncateAll(db)
  })

  afterAll(async () => {
    await app?.close()
    await db?.end()
  })

  /** A live session for a brand new account, which is all the auth hook needs to resolve a user. */
  async function seedSession(): Promise<{ token: string, userId: number }> {
    const user = await db.query<{ id: number }>(
      `INSERT INTO "user" (master_public_key) VALUES ($1) RETURNING id`,
      [`master-${Math.random()}`],
    )
    const userId = user.rows[0]!.id

    const device = await db.query<{ id: number }>(
      `INSERT INTO user_device (user_id, public_key) VALUES ($1, $2) RETURNING id`,
      [userId, `device-${Math.random()}`],
    )

    const token = generateSessionToken()
    await db.query(
      `INSERT INTO user_session (device_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
      [device.rows[0]!.id, hashSessionToken(token), SESSION_TTL_SECONDS],
    )

    return { token, userId }
  }

  it('stores the favorite under the session owner, not under anything from the body', async () => {
    const { token, userId } = await seedSession()

    const response = await app.inject({
      method: 'POST',
      url: '/favorites',
      headers: { authorization: `Bearer ${token}` },
      // A user_id in the body must change nothing: the handler reads the session, not this.
      payload: { ...body, user_id: userId + 999 },
    })

    expect(response.statusCode).toBe(201)

    const { rows } = await db.query<{ user_id: number, url: string }>(
      'SELECT user_id, url FROM favorite',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.user_id).toBe(userId)
    expect(rows[0]?.url).toBe(body.url)
  })

  /** HF_TOKEN is unset under vitest, so the chunk stays pending and no network call is made. */
  it('writes a pending chunk holding the title and the content', async () => {
    const { token, userId } = await seedSession()

    await app.inject({
      method: 'POST',
      url: '/favorites',
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    })

    const { rows } = await db.query<{
      favorite_id: number
      user_id: number
      content: string
      embedding: string | null
    }>(
      `SELECT c.favorite_id, c.user_id, c.content, c.embedding
         FROM favorite_chunk c JOIN favorite f ON f.id = c.favorite_id`,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.user_id).toBe(userId)
    expect(rows[0]?.content).toBe(`${body.title}\n\n${body.content}`)
    expect(rows[0]?.embedding).toBeNull()
  })

  it('leaves no orphan chunk when the save conflicts', async () => {
    const { token } = await seedSession()
    const request = {
      method: 'POST' as const,
      url: '/favorites',
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    }

    await app.inject(request)
    await app.inject(request)

    const { rows } = await db.query<{ count: string }>('SELECT count(*) FROM favorite_chunk')
    expect(rows[0]?.count).toBe('1')
  })

  it('rejects an anonymous save before the handler runs', async () => {
    const response = await app.inject({ method: 'POST', url: '/favorites', payload: body })

    // 401 and not a 500 on `request.user.id`: what the route's non-null typing rests on
    expect(response.statusCode).toBe(401)

    const { rows } = await db.query<{ count: string }>('SELECT count(*) FROM favorite')
    expect(rows[0]?.count).toBe('0')
  })

  it('answers 409 when the same user saves the same url twice', async () => {
    const { token } = await seedSession()
    const request = {
      method: 'POST' as const,
      url: '/favorites',
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    }

    expect((await app.inject(request)).statusCode).toBe(201)
    expect((await app.inject(request)).statusCode).toBe(409)

    const { rows } = await db.query<{ count: string }>('SELECT count(*) FROM favorite')
    expect(rows[0]?.count).toBe('1')
  })

  it('keeps two users saving the same url apart', async () => {
    const first = await seedSession()
    const second = await seedSession()

    for (const session of [first, second]) {
      const response = await app.inject({
        method: 'POST',
        url: '/favorites',
        headers: { authorization: `Bearer ${session.token}` },
        payload: body,
      })
      expect(response.statusCode).toBe(201)
    }

    const { rows } = await db.query<{ user_id: number }>(
      'SELECT user_id FROM favorite ORDER BY user_id',
    )
    expect(rows.map(row => row.user_id)).toEqual([first.userId, second.userId])
  })
})
