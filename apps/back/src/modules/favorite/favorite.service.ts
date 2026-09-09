import type { FastifyBaseLogger } from 'fastify'
import type { Pool } from 'pg'
import type { PendingChunk } from './favorite-chunk.repository'
import type { Favorite } from './favorite.schema'
import { embed, isEmbeddingEnabled } from '../embedding/embedding.service'
import { insertPendingChunks, updateChunkEmbedding } from './favorite-chunk.repository'
import { hasFavorite, insertFavorite } from './favorite.repository'

export type CreateFavoriteResult
  = | { status: 'created' }
    | { status: 'conflict' }

const CHUNK_BUDGET = 900
const CHUNK_OVERLAP = 150

/**
 * Saves a page and starts embedding it, reporting a conflict when the user already has it.
 */
export async function createFavorite(
  db: Pool,
  log: FastifyBaseLogger,
  userId: number,
  input: Favorite,
): Promise<CreateFavoriteResult> {
  const chunks = await saveFavoriteWithChunks(db, userId, input)

  if (chunks === null) {
    return { status: 'conflict' }
  }

  void embedChunks(db, log, chunks)

  return { status: 'created' }
}

/**
 * True when the url is already in this user's favorites.
 */
export async function isFavoriteSaved(db: Pool, userId: number, url: string): Promise<boolean> {
  return hasFavorite(db, userId, url)
}

/**
 * Writes the favorite and all its chunks in one transaction, or nothing at all.
 */
async function saveFavoriteWithChunks(
  db: Pool,
  userId: number,
  input: Favorite,
): Promise<PendingChunk[] | null> {
  const client = await db.connect()

  try {
    await client.query('BEGIN')

    const favorite = await insertFavorite(client, {
      userId,
      url: input.url,
      title: input.title,
    })

    if (!favorite) {
      await client.query('ROLLBACK')
      return null
    }

    const chunks = await insertPendingChunks(client, {
      favoriteId: favorite.id,
      userId,
      contents: chunkContents(input),
    })

    await client.query('COMMIT')

    return chunks
  }
  catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
  finally {
    client.release()
  }
}

/**
 * The passages to embed, the title kept apart as the highest-signal text a favorite has.
 */
function chunkContents(input: Favorite): string[] {
  return [input.title, ...(input.content ? splitIntoChunks(input.content) : [])]
}

/**
 * Packs sentences into chunks the embedding model can read whole.
 */
function splitIntoChunks(content: string): string[] {
  const chunks: string[] = []
  let current = ''

  for (const piece of splitSentences(content)) {
    if (!current) {
      current = piece
      continue
    }

    if (current.length + 1 + piece.length <= CHUNK_BUDGET) {
      current = `${current} ${piece}`
      continue
    }

    chunks.push(current)

    const overlap = overlapOf(current)
    current = overlap.length + 1 + piece.length <= CHUNK_BUDGET ? `${overlap} ${piece}` : piece
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}

/**
 * Splits content into sentences, each already short enough to fit a chunk.
 */
function splitSentences(content: string): string[] {
  const pieces: string[] = []

  for (const sentence of content.match(/[^.!?]+[.!?]*\s*/g) ?? [content]) {
    const trimmed = sentence.trim()

    for (let start = 0; start < trimmed.length; start += CHUNK_BUDGET) {
      pieces.push(trimmed.slice(start, start + CHUNK_BUDGET))
    }
  }

  return pieces
}

/**
 * The tail of a chunk, cut back to a word boundary, to repeat at the head of the next one.
 */
function overlapOf(chunk: string): string {
  if (chunk.length <= CHUNK_OVERLAP) {
    return chunk
  }

  const tail = chunk.slice(-CHUNK_OVERLAP)
  const boundary = tail.indexOf(' ')

  return boundary === -1 ? tail : tail.slice(boundary + 1)
}

/**
 * Embeds each chunk in turn after the response went out, leaving failures null.
 */
async function embedChunks(db: Pool, log: FastifyBaseLogger, chunks: PendingChunk[]): Promise<void> {
  if (!isEmbeddingEnabled()) {
    log.warn({ chunkCount: chunks.length }, 'HF_TOKEN unset, favorite chunks left unembedded')
    return
  }

  for (const chunk of chunks) {
    try {
      await updateChunkEmbedding(db, chunk.id, await embed(chunk.content))
    }
    catch (error) {
      log.error({ err: error, chunkId: chunk.id }, 'Failed to embed favorite chunk')
    }
  }
}
