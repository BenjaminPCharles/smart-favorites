import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('user', {
    id: 'id',
    public_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      default: pgm.func('gen_random_uuid()'),
    },
    secret_hash: {
      type: 'text',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('now()'),
    },
  })

  pgm.createType('favorite_category', ['developer', 'security', 'design', 'tools', 'learning', 'news', 'entertainment'])

  pgm.createTable('favorite', {
    id: 'id',
    uuid: { type: 'uuid', notNull: true, unique: true, default: pgm.func('gen_random_uuid()') },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    url: { type: 'text', notNull: true },
    title: { type: 'text', notNull: true },
    description: { type: 'text', notNull: false },
    category: { type: 'favorite_category', notNull: true },
    user_id: { type: 'integer', notNull: true, references: '"user"', referencesConstraintName: 'fk_favorite_user' },
  })
  pgm.createIndex('favorite', 'user_id')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('favorite', { ifExists: true })
  pgm.dropType('favorite_category', { ifExists: true })
  pgm.dropTable('user', { ifExists: true })
}
