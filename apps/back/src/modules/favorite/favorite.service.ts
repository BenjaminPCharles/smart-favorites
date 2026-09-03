import type { FastifyBaseLogger } from 'fastify'
import type { Pool } from 'pg'
import type { Favorite } from './favorite.schema'
import { embed, isEmbeddingEnabled } from '../embedding/embedding.service'
import { insertPendingChunk, updateChunkEmbedding } from './favorite-chunk.repository'
import { insertFavorite } from './favorite.repository'

export type CreateFavoriteResult
  = | { status: 'created' }
    | { status: 'conflict' }

/** Conflict rather than an error: re-saving a page the user already has is a no-op, not a failure. */
export async function createFavorite(
  db: Pool,
  log: FastifyBaseLogger,
  userId: number,
  input: Favorite,
): Promise<CreateFavoriteResult> {
  const content = chunkContent(input)
  const chunkId = await saveFavoriteWithChunk(db, userId, input, content)

  if (chunkId === null) {
    return { status: 'conflict' }
  }

  // Detached on purpose: the save is already durable, and HuggingFace must never hold the response.
  void embedChunk(db, log, chunkId, content)

  return { status: 'created' }
}

/** Both rows or neither: a favorite with no chunk is invisible to search and to any retry query. */
async function saveFavoriteWithChunk(
  db: Pool,
  userId: number,
  input: Favorite,
  content: string,
): Promise<number | null> {
  const client = await db.connect()

  try {
    await client.query('BEGIN')

    const favorite = await insertFavorite(client, {
      userId,
      url: input.url,
      title: input.title,
      content: input.content,
    })

    if (!favorite) {
      await client.query('ROLLBACK')
      return null
    }

    const chunkId = await insertPendingChunk(client, {
      favoriteId: favorite.id,
      userId,
      content,
    })

    await client.query('COMMIT')

    return chunkId
  }
  catch (error) {
    // Swallowed: a rollback that fails on a dead connection must not replace the real error.
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
  finally {
    client.release()
  }
}

/** One chunk per favorite for now. Title first, so a save without scraped content still embeds something. */
function chunkContent(input: Favorite): string {
  return input.content ? `${input.title}\n\n${input.content}` : input.title
}

/** Runs after the 201 went out. A failure leaves `embedding NULL`, which is what a retry looks for. */
async function embedChunk(db: Pool, log: FastifyBaseLogger, chunkId: number, content: string): Promise<void> {
  if (!isEmbeddingEnabled()) {
    log.warn({ chunkId }, 'HF_TOKEN unset, favorite chunk left unembedded')
    return
  }

  try {
    await updateChunkEmbedding(db, chunkId, await embed(content))
  }
  catch (error) {
    log.error({ err: error, chunkId }, 'Failed to embed favorite chunk')
  }
}
