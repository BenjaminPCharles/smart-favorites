import type { Querier } from '../../shared/db/querier'

export interface FavoriteRow {
  /** Internal key, never sent to a client: favorite_chunk's foreign key needs it. */
  id: number
  uuid: string
  url: string
  title: string
  createdAt: Date
}

export interface NewFavorite {
  userId: number
  url: string
  title: string
  content: string | null
}

/** Null when this user already saved this url, the caller turns it into a 409. */
export async function insertFavorite(db: Querier, favorite: NewFavorite): Promise<FavoriteRow | null> {
  // content stays out of RETURNING: it's the scraped blob, no caller of a create reads it back
  const result = await db.query<{
    id: number
    uuid: string
    url: string
    title: string
    created_at: Date
  }>(
    `INSERT INTO favorite (user_id, url, title, content)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, url) DO NOTHING
     RETURNING id, uuid, url, title, created_at`,
    [favorite.userId, favorite.url, favorite.title, favorite.content],
  )

  const row = result.rows[0]

  return row
    ? {
        id: row.id,
        uuid: row.uuid,
        url: row.url,
        title: row.title,
        createdAt: row.created_at,
      }
    : null
}

