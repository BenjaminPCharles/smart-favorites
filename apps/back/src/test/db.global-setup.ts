import { migrateTestDatabase } from './db.helper'

/** Applies the migrations once per run, before any database test file opens a pool. */
export default async function setup(): Promise<void> {
  await migrateTestDatabase()
}
