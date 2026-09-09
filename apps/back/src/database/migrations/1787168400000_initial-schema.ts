import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS vector')

  pgm.createTable('user', {
    id: 'id',
    public_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      default: pgm.func('gen_random_uuid()'),
    },
    master_public_key: {
      type: 'text',
      notNull: true,
      unique: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })

  pgm.createTable('user_device', {
    id: 'id',
    uuid: {
      type: 'uuid',
      notNull: true,
      unique: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'integer',
      notNull: true,
      references: '"user"',
      referencesConstraintName: 'fk_user_device_user',
      onDelete: 'CASCADE',
    },
    public_key: {
      type: 'text',
      notNull: true,
      unique: true,
    },
    label: {
      type: 'text',
      notNull: false,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    last_used_at: {
      type: 'timestamptz',
      notNull: false,
    },
    revoked_at: {
      type: 'timestamptz',
      notNull: false,
    },
  })
  pgm.createIndex('user_device', 'user_id')

  pgm.createTable('user_session', {
    id: 'id',
    device_id: {
      type: 'integer',
      notNull: true,
      references: 'user_device',
      referencesConstraintName: 'fk_user_session_user_device',
      onDelete: 'CASCADE',
    },
    token_hash: {
      type: 'text',
      notNull: true,
      unique: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    revoked_at: {
      type: 'timestamptz',
      notNull: false,
    },
  })
  pgm.createIndex('user_session', 'device_id')
  pgm.createIndex('user_session', 'expires_at')

  pgm.createTable('auth_challenge', {
    nonce: {
      type: 'text',
      primaryKey: true,
    },
    public_key: {
      type: 'text',
      notNull: true,
    },
    purpose: {
      type: 'text',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    used_at: {
      type: 'timestamptz',
      notNull: false,
    },
  })
  pgm.createIndex('auth_challenge', 'expires_at')

  pgm.createType('favorite_category', [
    'developer',
    'security',
    'design',
    'tools',
    'learning',
    'news',
    'entertainment',
  ])

  pgm.createTable('favorite', {
    id: 'id',
    uuid: {
      type: 'uuid',
      notNull: true,
      unique: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'integer',
      notNull: true,
      references: '"user"',
      referencesConstraintName: 'fk_favorite_user',
      onDelete: 'CASCADE',
    },
    url: {
      type: 'text',
      notNull: true,
    },
    title: {
      type: 'text',
      notNull: true,
    },
    description: {
      type: 'text',
      notNull: false,
    },
    category: {
      type: 'favorite_category',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.addConstraint('favorite', 'favorite_user_id_url_key', {
    unique: ['user_id', 'url'],
  })
  pgm.addConstraint('favorite', 'favorite_id_user_id_key', {
    unique: ['id', 'user_id'],
  })

  pgm.createTable('favorite_chunk', {
    id: 'id',
    favorite_id: {
      type: 'integer',
      notNull: true,
    },
    user_id: {
      type: 'integer',
      notNull: true,
    },
    content: {
      type: 'text',
      notNull: true,
    },
    metadata: {
      type: 'jsonb',
      notNull: false,
    },
    embedding: {
      type: 'vector(384)',
      notNull: false,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.addConstraint('favorite_chunk', 'fk_favorite_chunk_favorite', {
    foreignKeys: {
      columns: ['favorite_id', 'user_id'],
      references: 'favorite (id, user_id)',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
  })

  pgm.createIndex('favorite_chunk', 'user_id')
  pgm.createIndex('favorite_chunk', 'favorite_id')

  pgm.sql('CREATE INDEX favorite_chunk_embedding_idx ON favorite_chunk USING hnsw (embedding vector_cosine_ops)')
}

/**
 * Full teardown in reverse order, each drop named so it reads as the inverse of `up`.
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('favorite_chunk', { ifExists: true })
  pgm.dropTable('favorite', { ifExists: true })
  pgm.dropType('favorite_category', { ifExists: true })
  pgm.dropTable('auth_challenge', { ifExists: true })
  pgm.dropTable('user_session', { ifExists: true })
  pgm.dropTable('user_device', { ifExists: true })
  pgm.dropTable('user', { ifExists: true })
  pgm.sql('DROP EXTENSION IF EXISTS vector')
}
