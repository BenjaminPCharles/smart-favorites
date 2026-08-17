import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

// Bearer secrets out, signature auth in. Only public keys and token hashes are
// stored now, so a full db leak lets nobody authenticate. See docs/AUTH.md.

// Clean break, no compat layer: no production user yet, and master_public_key is
// notNull with no default, so existing rows go with their favorites.

// New columns are timestamptz. On a bare `timestamp` node-postgres reparses `now()`
// locally, so every expiry is computed and compared in SQL, never with Date.now().
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('TRUNCATE TABLE "user" CASCADE')

  pgm.dropColumn('user', 'secret_hash')
  pgm.addColumns('user', {
    // Ed25519, 32 raw bytes, canonical base64url (43 chars)
    master_public_key: {
      type: 'text',
      notNull: true,
      unique: true,
    },
  })

  /**
   * One ECDSA P-256 keypair per install, private half a non-extractable CryptoKey in
   * IndexedDB. public_key is globally unique, so a revoked key can't be
   * re-registered. On purpose: a revoked key stays dead.
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
   * Opaque 32-byte CSPRNG token, stored hashed, 15 minute TTL. The extension renews
   * it silently by signing a fresh challenge.
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

  // Single-use nonce, bound to a public key and to what it can be spent on. Without
  // `purpose`, /auth/rotate would make a device-register nonce spendable against
  // "user". Named purpose and not usage because USAGE is a Postgres keyword.
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

  // No index on auth_challenge.public_key, consumption always goes through the
  // primary key. The unique constraints elsewhere already cover the hot paths.
}

/**
 * Back to the bearer-secret schema. secret_hash returns nullable, the plaintext
 * secrets are gone so notNull can't be restored.
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('auth_challenge', { ifExists: true })
  pgm.dropTable('user_session', { ifExists: true })
  pgm.dropTable('user_device', { ifExists: true })
  pgm.dropColumn('user', 'master_public_key', { ifExists: true })
  pgm.addColumns('user', {
    secret_hash: {
      type: 'text',
      notNull: false,
    },
  })
}
