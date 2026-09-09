import type { Querier } from '../../shared/db/querier'

export interface NewChunks {
  favoriteId: number
  userId: number
  contents: string[]
}

export interface PendingChunk {
  id: number
  content: string
}

/**
 * Inserts the chunks of one favorite with their embedding still null.
 */
export async function insertPendingChunks(db: Querier, chunks: NewChunks): Promise<PendingChunk[]> {
  const result = await db.query<PendingChunk>(
    `INSERT INTO favorite_chunk (favorite_id, user_id, content)
     SELECT $1, $2, content FROM unnest($3::text[]) AS content
     RETURNING id, content`,
    [chunks.favoriteId, chunks.userId, chunks.contents],
  )

  return result.rows
}

/**
 * Fills in a chunk embedding once HuggingFace has answered.
 */
export async function updateChunkEmbedding(db: Querier, chunkId: number, embedding: number[]): Promise<void> {
  await db.query(
    'UPDATE favorite_chunk SET embedding = $2 WHERE id = $1',
    [chunkId, JSON.stringify(embedding)],
  )
}
