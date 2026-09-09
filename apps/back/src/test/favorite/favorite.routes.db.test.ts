import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import process from 'node:process'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { generateSessionToken, hashSessionToken, SESSION_TTL_SECONDS } from '../../modules/auth/crypto/session-token'
import { createTestPool, testDatabaseConfig, truncateAll } from '../db.helper'

describe.skipIf(!inject('dbReady'))('favoriteRoutes', () => {
  let db: Pool
  let app: FastifyInstance

  const body = {
    url: 'https://example.com/article',
    title: 'Example',
    content: 'page text',
  }

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

  /**
   * A live session for a brand new account, all the auth hook needs to resolve a user.
   */
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

  it('writes the title and the content as separate pending chunks', async () => {
    const { token, userId } = await seedSession()

    await app.inject({
      method: 'POST',
      url: '/favorites',
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    })

    const { rows } = await db.query<{
      user_id: number
      content: string
      embedding: string | null
    }>(
      `SELECT c.user_id, c.content, c.embedding
         FROM favorite_chunk c JOIN favorite f ON f.id = c.favorite_id
        ORDER BY c.id`,
    )

    expect(rows.map(row => row.content)).toEqual([body.title, body.content])
    expect(rows.every(row => row.user_id === userId)).toBe(true)
    expect(rows.every(row => row.embedding === null)).toBe(true)
  })

  it('splits a long page into chunks the embedding model can read whole', async () => {
    const { token } = await seedSession()
    const sentence = `${'word '.repeat(40).trim()}. `

    await app.inject({
      method: 'POST',
      url: '/favorites',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...body, content: sentence.repeat(30) },
    })

    const { rows } = await db.query<{ content: string }>(
      'SELECT content FROM favorite_chunk ORDER BY id',
    )

    expect(rows.length).toBeGreaterThan(5)
    expect(Math.max(...rows.map(row => row.content.length))).toBeLessThanOrEqual(900)
  })

  it('splits content that carries no sentence punctuation', async () => {
    const { token } = await seedSession()

    await app.inject({
      method: 'POST',
      url: '/favorites',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...body, content: 'x'.repeat(3000) },
    })

    const { rows } = await db.query<{ content: string }>(
      'SELECT content FROM favorite_chunk ORDER BY id',
    )

    expect(rows[0]?.content).toBe(body.title)
    expect(rows.length).toBeGreaterThan(3)
    expect(Math.max(...rows.map(row => row.content.length))).toBeLessThanOrEqual(900)
  })

  it('saves a favorite whose page could not be scraped', async () => {
    const { token } = await seedSession()

    const response = await app.inject({
      method: 'POST',
      url: '/favorites',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...body, content: null },
    })

    expect(response.statusCode).toBe(201)

    const { rows } = await db.query<{ content: string }>('SELECT content FROM favorite_chunk')
    expect(rows.map(row => row.content)).toEqual([body.title])
  })

  it.each([
    ['a non-http scheme', { ...body, url: 'javascript:alert(1)' }],
    ['a url over the length cap', { ...body, url: `https://example.com/${'a'.repeat(2048)}` }],
    ['content over the length cap', { ...body, content: 'a'.repeat(20_001) }],
    ['an empty title', { ...body, title: '' }],
  ])('rejects %s without writing anything', async (_case, payload) => {
    const { token } = await seedSession()

    const response = await app.inject({
      method: 'POST',
      url: '/favorites',
      headers: { authorization: `Bearer ${token}` },
      payload,
    })

    expect(response.statusCode).toBe(400)

    const { rows } = await db.query<{ count: string }>('SELECT count(*) FROM favorite')
    expect(rows[0]?.count).toBe('0')
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
    expect(rows[0]?.count).toBe('2')
  })

  it('rejects an anonymous save before the handler runs', async () => {
    const response = await app.inject({ method: 'POST', url: '/favorites', payload: body })

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

  describe('existence check, POST /favorites/lookup', () => {
    /**
     * Saves the shared body for this session through the API.
     */
    async function seedFavorite(token: string): Promise<void> {
      await app.inject({
        method: 'POST',
        url: '/favorites',
        headers: { authorization: `Bearer ${token}` },
        payload: body,
      })
    }

    async function askExists(token: string, url: string): Promise<{ statusCode: number, exists?: boolean }> {
      const response = await app.inject({
        method: 'POST',
        url: '/favorites/lookup',
        payload: { url },
        headers: { authorization: `Bearer ${token}` },
      })

      return {
        statusCode: response.statusCode,
        exists: (response.json() as { exists?: boolean }).exists,
      }
    }

    it('answers false for a url this user never saved', async () => {
      const { token } = await seedSession()

      expect(await askExists(token, body.url)).toEqual({ statusCode: 200, exists: false })
    })

    it('answers true once the url is saved', async () => {
      const { token } = await seedSession()
      await seedFavorite(token)

      expect(await askExists(token, body.url)).toEqual({ statusCode: 200, exists: true })
    })

    it('does not report another user\'s favorite', async () => {
      const owner = await seedSession()
      const other = await seedSession()
      await seedFavorite(owner.token)

      expect(await askExists(other.token, body.url)).toEqual({ statusCode: 200, exists: false })
    })

    it('rejects an anonymous check', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/favorites/lookup',
        payload: { url: body.url },
      })

      expect(response.statusCode).toBe(401)
    })

    it('rejects a missing, malformed or non-http url without reaching the database', async () => {
      const { token } = await seedSession()

      expect((await askExists(token, 'not-a-url')).statusCode).toBe(400)
      expect((await askExists(token, 'javascript:alert(1)')).statusCode).toBe(400)

      const response = await app.inject({
        method: 'POST',
        url: '/favorites/lookup',
        payload: {},
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.statusCode).toBe(400)
    })
  })
})
