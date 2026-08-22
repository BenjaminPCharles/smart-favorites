import type { TestProject } from 'vitest/node'
import process from 'node:process'
import { isTestDatabaseReachable, migrateTestDatabase, testDatabaseConfig } from './db.helper'

declare module 'vitest' {
  interface ProvidedContext {
    /** False when the test database is unreachable: the `db` suites skip themselves. */
    dbReady: boolean
  }
}

/** Migrates once per run, and prints the skip reason vitest does not show next to a skipped suite. */
export default async function setup({ provide }: TestProject): Promise<void> {
  if (!await isTestDatabaseReachable()) {
    const { host, port, database } = testDatabaseConfig
    const target = `${host}:${port}/${database}`

    // In CI the service container is guaranteed, so skipping would leave the job green for nothing.
    if (process.env.CI) {
      throw new Error(
        `Test database unreachable at ${target}, and CI is set. The service container in `
        + `.github/workflows/ci.yml is down, or TEST_DB_* does not match its published port.`,
      )
    }

    console.warn(
      `\n  Database tests SKIPPED: nothing answering at ${target}.\n`
      + `  Start it with:  docker compose -f docker-compose.db.yml up -d --wait testdatabase\n`,
    )
    provide('dbReady', false)
    return
  }

  await migrateTestDatabase()
  provide('dbReady', true)
}
