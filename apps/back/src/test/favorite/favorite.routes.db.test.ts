import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import process from 'node:process'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { generateSessionToken, hashSessionToken, SESSION_TTL_SECONDS } from '../../modules/auth/crypto/session-token'
import { createTestPool, testDatabaseConfig, truncateAll } from '../db.helper'

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

/** Creates a live session for a brand new account, all the auth hook needs to resolve a user. */
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

/** Saves a favorite for this session through the API. */
async function saveFavorite(token: string, payload: object = body): Promise<{ statusCode: number }> {
  const response = await app.inject({
    method: 'POST',
    url: '/favorites',
    headers: { authorization: `Bearer ${token}` },
    payload,
  })

  return { statusCode: response.statusCode }
}

/** Asks whether a url is already saved for this session. */
async function askExists(token: string, url: unknown): Promise<{ statusCode: number, exists?: boolean }> {
  const response = await app.inject({
    method: 'POST',
    url: '/favorites/lookup',
    headers: { authorization: `Bearer ${token}` },
    payload: url === undefined ? {} : { url },
  })

  return {
    statusCode: response.statusCode,
    exists: (response.json() as { exists?: boolean }).exists,
  }
}

/** Reads back every chunk row, oldest first. */
async function readChunks(): Promise<{ user_id: number, content: string, embedding: string | null }[]> {
  const { rows } = await db.query<{ user_id: number, content: string, embedding: string | null }>(
    `SELECT c.user_id, c.content, c.embedding
       FROM favorite_chunk c JOIN favorite f ON f.id = c.favorite_id
      ORDER BY c.id`,
  )

  return rows
}

/** Counts the rows of a table, as a number. */
async function countRows(table: 'favorite' | 'favorite_chunk'): Promise<number> {
  const { rows } = await db.query<{ count: string }>(`SELECT count(*) FROM ${table}`)

  return Number(rows[0]?.count)
}

describe('SUCCESS', () => {
  it('stores the favorite under the session owner, not under anything from the body', async () => {
    const { token, userId } = await seedSession()

    const response = await saveFavorite(token, { ...body, user_id: userId + 999 })
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

    await saveFavorite(token)

    const chunks = await readChunks()
    expect(chunks.map(chunk => chunk.content)).toEqual([body.title, body.content])
    expect(chunks.every(chunk => chunk.user_id === userId)).toBe(true)
    expect(chunks.every(chunk => chunk.embedding === null)).toBe(true)
  })

  it('splits a long page into chunks the embedding model can read whole', async () => {
    const { token } = await seedSession()
    const sentence = `${'word '.repeat(40).trim()}. `

    await saveFavorite(token, { ...body, content: sentence.repeat(30) })

    const chunks = await readChunks()
    expect(chunks.length).toBeGreaterThan(5)
    expect(Math.max(...chunks.map(chunk => chunk.content.length))).toBeLessThanOrEqual(900)
  })

  it('splits content that carries no sentence punctuation', async () => {
    const { token } = await seedSession()

    await saveFavorite(token, { ...body, content: 'x'.repeat(3000) })

    const chunks = await readChunks()
    expect(chunks[0]?.content).toBe(body.title)
    expect(chunks.length).toBeGreaterThan(3)
    expect(Math.max(...chunks.map(chunk => chunk.content.length))).toBeLessThanOrEqual(900)
  })

  it('saves a favorite whose page could not be scraped', async () => {
    const { token } = await seedSession()

    const response = await saveFavorite(token, { ...body, content: null })
    expect(response.statusCode).toBe(201)

    const chunks = await readChunks()
    expect(chunks.map(chunk => chunk.content)).toEqual([body.title])
  })

  it('keeps two users saving the same url apart', async () => {
    const first = await seedSession()
    const second = await seedSession()

    expect((await saveFavorite(first.token)).statusCode).toBe(201)
    expect((await saveFavorite(second.token)).statusCode).toBe(201)

    const { rows } = await db.query<{ user_id: number }>(
      'SELECT user_id FROM favorite ORDER BY user_id',
    )
    expect(rows.map(row => row.user_id)).toEqual([first.userId, second.userId])
  })

  it('answers false on lookup for a url this user never saved', async () => {
    const { token } = await seedSession()

    expect(await askExists(token, body.url)).toEqual({ statusCode: 200, exists: false })
  })

  it('answers true on lookup once the url is saved', async () => {
    const { token } = await seedSession()
    await saveFavorite(token)

    expect(await askExists(token, body.url)).toEqual({ statusCode: 200, exists: true })
  })

  it('does not report another user\'s favorite on lookup', async () => {
    const owner = await seedSession()
    const other = await seedSession()
    await saveFavorite(owner.token)

    expect(await askExists(other.token, body.url)).toEqual({ statusCode: 200, exists: false })
  })
})

describe('ERROR', () => {
  it.each([
    ['a non-http scheme', { ...body, url: 'javascript:alert(1)' }],
    ['a url over the length cap', { ...body, url: `https://example.com/${'a'.repeat(2048)}` }],
    ['content over the length cap', { ...body, content: 'a'.repeat(20_001) }],
    ['an empty title', { ...body, title: '' }],
  ])('rejects %s without writing anything', async (_case, payload) => {
    const { token } = await seedSession()

    expect((await saveFavorite(token, payload)).statusCode).toBe(400)
    expect(await countRows('favorite')).toBe(0)
  })

  it('rejects an anonymous save before the handler runs', async () => {
    const response = await app.inject({ method: 'POST', url: '/favorites', payload: body })

    expect(response.statusCode).toBe(401)
    expect(await countRows('favorite')).toBe(0)
  })

  it('answers 409 when the same user saves the same url twice', async () => {
    const { token } = await seedSession()

    expect((await saveFavorite(token)).statusCode).toBe(201)
    expect((await saveFavorite(token)).statusCode).toBe(409)
    expect(await countRows('favorite')).toBe(1)
  })

  it('leaves no orphan chunk when the save conflicts', async () => {
    const { token } = await seedSession()

    await saveFavorite(token)
    await saveFavorite(token)

    expect(await countRows('favorite_chunk')).toBe(2)
  })

  it('rejects an anonymous lookup', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/favorites/lookup',
      payload: { url: body.url },
    })

    expect(response.statusCode).toBe(401)
  })

  it('rejects a missing, malformed or non-http lookup url without reaching the database', async () => {
    const { token } = await seedSession()

    expect((await askExists(token, 'not-a-url')).statusCode).toBe(400)
    expect((await askExists(token, 'javascript:alert(1)')).statusCode).toBe(400)
    expect((await askExists(token, undefined)).statusCode).toBe(400)
  })
})
