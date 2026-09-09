import type { TestProjectConfiguration } from 'vitest/config'
import process from 'node:process'
import { defineConfig } from 'vitest/config'
import { isTestDatabaseReachable, testDatabaseConfig } from './src/test/db.helper'

const { host, port, database } = testDatabaseConfig
const TEST_DB_TARGET = `${host}:${port}/${database}`

const unitProject: TestProjectConfiguration = {
  test: {
    name: 'unit',
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
    exclude: ['src/test/**/*.db.test.ts'],
  },
}

const dbProject: TestProjectConfiguration = {
  test: {
    name: 'db',
    environment: 'node',
    include: ['src/test/**/*.db.test.ts'],
    globalSetup: ['./src/test/db.global-setup.ts'],
    poolOptions: {
      forks: { singleFork: true },
    },
  },
}

/** Tells whether the throwaway database answers, and throws instead of returning false under CI. */
async function hasTestDatabase(): Promise<boolean> {
  if (await isTestDatabaseReachable())
    return true

  if (process.env.CI) {
    throw new Error(
      `Test database unreachable at ${TEST_DB_TARGET}, and CI is set. The service container in `
      + `.github/workflows/ci.yml is down, or TEST_DB_* does not match its published port.`,
    )
  }

  console.warn(
    `\n  Database tests SKIPPED: nothing answering at ${TEST_DB_TARGET}.\n`
    + `  Start it with:  docker compose -f docker-compose.db.yml up -d --wait testdatabase\n`,
  )

  return false
}

export default defineConfig(async () => ({
  test: {
    projects: await hasTestDatabase() ? [unitProject, dbProject] : [unitProject],
  },
}))
