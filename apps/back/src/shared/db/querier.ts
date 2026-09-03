import type { Pool, PoolClient } from 'pg'

/** What a repository needs: the pool for a lone statement, a client when the caller opened a transaction. */
export type Querier = Pool | PoolClient
