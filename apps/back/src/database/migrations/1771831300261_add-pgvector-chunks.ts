import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS vector')

  pgm.createTable('chunks', {
    id: 'id',
    content: { type: 'text', notNull: true },
    metadata: { type: 'jsonb', notNull: false },
    embedding: { type: 'vector(384)', notNull: false },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  })

  pgm.sql('CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops)')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('chunks', { ifExists: true })
  pgm.sql('DROP EXTENSION IF EXISTS vector')
}
