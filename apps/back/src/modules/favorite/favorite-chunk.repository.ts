import type { Querier } from '../../shared/db/querier'

export interface NewChunk {
  favoriteId: number
  userId: number
  content: string
}

/** user_id is duplicated from favorite on purpose: it carries the composite FK and the search filter. */
export async function insertPendingChunk(db: Querier, chunk: NewChunk): Promise<number> {
  // embedding stays NULL here, filled in once HuggingFace answers
  const result = await db.query<{ id: number }>(
    `INSERT INTO favorite_chunk (favorite_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [chunk.favoriteId, chunk.userId, chunk.content],
  )

  return result.rows[0]!.id
}

/** pgvector parses the array from its text form, which is exactly what JSON.stringify emits. */
export async function updateChunkEmbedding(db: Querier, chunkId: number, embedding: number[]): Promise<void> {
  await db.query(
    'UPDATE favorite_chunk SET embedding = $2 WHERE id = $1',
    [chunkId, JSON.stringify(embedding)],
  )
}
