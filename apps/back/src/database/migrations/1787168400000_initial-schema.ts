import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined


export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS vector')

  /**
   * An account is a BIP39 phrase, nothing else: no email, no password. Only the public
   * half of the master key is stored, so a full database leak lets nobody authenticate.
   * `public_id` is what may be shown or logged; `id` never leaves the server.
   */
  pgm.createTable('user', {
    id: 'id',
    public_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      default: pgm.func('gen_random_uuid()'),
    },
    // Ed25519, 32 raw bytes, canonical base64url (43 chars)
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

  /**
   * One ECDSA P-256 keypair per install, private half a non-extractable CryptoKey in
   * IndexedDB. `public_key` is globally unique, so a revoked key can never be
   * re-registered — on purpose: a revoked key stays dead.
   */
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
    // P-256 SPKI DER, 91 bytes, canonical base64url (122 chars)
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

  /**
   * Opaque 32-byte CSPRNG token, stored hashed, 15 minute TTL. The extension renews it
   * silently by signing a fresh challenge, which is why the user never signs in again.
   */
  pgm.createTable('user_session', {
    id: 'id',
    device_id: {
      type: 'integer',
      notNull: true,
      references: 'user_device',
      referencesConstraintName: 'fk_user_session_user_device',
      onDelete: 'CASCADE',
    },
    // SHA-256 of the opaque token, hex
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

  /**
   * Single-use nonce, bound to a public key and to what it can be spent on. Without
   * `purpose`, a device-register nonce would be spendable against /auth/rotate. Named
   * `purpose` and not `usage` because USAGE is a Postgres keyword.
   *
   * No index on `public_key`: consumption always goes through the primary key.
   */
  pgm.createTable('auth_challenge', {
    // 32 bytes CSPRNG, base64url
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

  /**
   * A saved page. `url` is stored as the client sends it: deciding that two URLs designate
   * the same page (lowercase host, fragment and tracking params dropped) is the service's
   * job, testable and changeable without a migration.
   *
   * `UNIQUE (user_id, url)` is what keeps a second save of the same page from creating a
   * second row, hence a second set of embeddings paid twice at Hugging Face. The pair is
   * also the leading-column index for every per-user read, so no separate index on
   * `user_id` is needed.
   *
   * `UNIQUE (id, user_id)` exists only to be the target of favorite_chunk's composite
   * foreign key — see below. It is redundant with the primary key, and that is the point.
   */
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
    // Where the passage comes from, once a favorite has more than one: offset, section,
    // extraction method. Unused while a favorite holds a single chunk.
    metadata: {
      type: 'jsonb',
      notNull: false,
    },
    // 384 dimensions: sentence-transformers/all-MiniLM-L6-v2. Nullable, so a favorite can
    // be saved before the embedding call comes back, or after it failed.
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

  // user_id serves the search filter, favorite_id the cascade and the per-favorite rewrite
  // of chunks when a favorite is saved again.
  pgm.createIndex('favorite_chunk', 'user_id')
  pgm.createIndex('favorite_chunk', 'favorite_id')

  // Cosine distance, matching the normalised output of the model. pgvector 0.8 can iterate
  // the index when a filter cuts the result set short (hnsw.iterative_scan).
  pgm.sql('CREATE INDEX favorite_chunk_embedding_idx ON favorite_chunk USING hnsw (embedding vector_cosine_ops)')
}

/**
 * Full teardown, reverse order. Cascades would carry most of it, but naming each drop
 * keeps the migration readable as the inverse of `up`.
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
