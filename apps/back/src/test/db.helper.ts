import type { PoolConfig } from 'pg'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { runner } from 'node-pg-migrate'
import { Client, Pool } from 'pg'

/** Throwaway database of `docker-compose.db.yml`. Defaults are load-bearing: vitest never reads `.env`. */
export const testDatabaseConfig: PoolConfig = {
  host: process.env.TEST_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT ?? 5433),
  user: process.env.TEST_DB_USER ?? 'smart_favorites_test',
  password: process.env.TEST_DB_PASSWORD ?? 'smart_favorites_test',
  database: process.env.TEST_DB_NAME ?? 'smart_favorites_test',
}

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../database/migrations',
)

/** node-pg-migrate's own table. Never truncated: it is what makes `up` idempotent. */
const MIGRATIONS_TABLE = 'pgmigrations'

/** Refuses to migrate or truncate a database whose name does not look disposable. */
function assertDisposable(): void {
  const name = String(testDatabaseConfig.database)

  if (!name.includes('test')) {
    throw new Error(
      `Refusing to run destructive test setup against "${name}": the database name must `
      + `contain "test". Set TEST_DB_NAME to the throwaway database, not to a real one.`,
    )
  }
}

/** Is the test database up? Short timeout, so a missing container costs seconds, not minutes. */
export async function isTestDatabaseReachable(timeoutMs = 2000): Promise<boolean> {
  const client = new Client({ ...testDatabaseConfig, connectionTimeoutMillis: timeoutMs })

  try {
    await client.connect()
    await client.end()
    return true
  }
  catch {
    // The caller turns this into a skipped suite, which is where the reason gets reported.
    await client.end().catch(() => {})
    return false
  }
}

/** Migrates via node-pg-migrate's API — same files as production, no shelling out to its CLI. */
export async function migrateTestDatabase(): Promise<void> {
  assertDisposable()

  await runner({
    databaseUrl: testDatabaseConfig,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: MIGRATIONS_TABLE,
    logger: { info: () => {}, warn: console.warn, error: console.error },
  })
}

/** Pool for a test file to query through. The caller closes it. */
export function createTestPool(): Pool {
  assertDisposable()

  return new Pool(testDatabaseConfig)
}

let tableList: string | null = null

/** Empties every table, sequences included. Table list from the catalog, so nothing is forgotten. */
export async function truncateAll(db: Pool): Promise<void> {
  assertDisposable()

  if (tableList === null) {
    const { rows } = await db.query<{ tables: string | null }>(
      `SELECT string_agg(quote_ident(tablename), ', ') AS tables
         FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> $1`,
      [MIGRATIONS_TABLE],
    )

    // Identifiers come from the catalog through quote_ident, never from user input.
    tableList = rows[0]?.tables ?? ''
  }

  if (tableList === '') {
    throw new Error(
      'No tables found in the test database. Did the migrations run? '
      + 'migrateTestDatabase() must be called before truncateAll().',
    )
  }

  await db.query(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`)
}
