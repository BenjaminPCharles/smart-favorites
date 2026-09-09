import type { Querier } from '../../shared/db/querier'

export interface FavoriteRow {
  id: number
}

export interface NewFavorite {
  userId: number
  url: string
  title: string
}

/**
 * Inserts a favorite, returning null when this user already saved this url.
 */
export async function insertFavorite(db: Querier, favorite: NewFavorite): Promise<FavoriteRow | null> {
  const result = await db.query<FavoriteRow>(
    `INSERT INTO favorite (user_id, url, title)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, url) DO NOTHING
     RETURNING id`,
    [favorite.userId, favorite.url, favorite.title],
  )

  return result.rows[0] ?? null
}

/**
 * True when this user already has a favorite on this exact url, ignoring everyone else's.
 */
export async function hasFavorite(db: Querier, userId: number, url: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM favorite WHERE user_id = $1 AND url = $2`,
    [userId, url],
  )

  return result.rows.length > 0
}
