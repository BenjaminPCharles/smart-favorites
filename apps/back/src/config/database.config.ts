import type { PoolClient } from 'pg'
import process from 'node:process'
import { Pool } from 'pg'

type DatabasePrefix = 'SERVICE_DB' | 'SCRAPE_DB'
export class DatabaseConfig {
  private pool: Pool | null = null

  constructor(private readonly prefix: DatabasePrefix) {}

  private validateEnvVar(key: 'HOST' | 'PORT' | 'USER' | 'PASSWORD' | 'NAME'): string {
    const currentVariable = process.env[`${this.prefix}_${key}`]
    if (!currentVariable) {
      throw new Error(`Missing required environment variable: ${this.prefix}_${key}`)
    }

    return currentVariable
  }

  getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        host: this.validateEnvVar('HOST'),
        port: Number(this.validateEnvVar('PORT') || 5432),
        user: this.validateEnvVar('USER'),
        password: this.validateEnvVar('PASSWORD'),
        database: this.validateEnvVar('NAME'),
      })
    }
    return this.pool
  }

  async connect(): Promise<PoolClient> {
    return await this.getPool().connect()
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
      this.pool = null
    }
  }
}
