import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * Replace the bearer-secret model by signature auth.
 *
 * The server no longer stores any secret: only Ed25519 / P-256 public keys and
 * SHA-256 hashes of ephemeral session tokens. A full database leak lets nobody
 * authenticate. See docs/AUTH.md.
 *
 * Clean break, no compatibility layer: there is no production user, and
 * `master_public_key` is notNull with no sensible default, so existing rows are
 * dropped along with their favorites.
 *
 * New columns are `timestamptz`, unlike the legacy ones: `now()` returns a
 * timestamptz that node-postgres reparses in the process's local timezone when the
 * column is a bare `timestamp`. Cosmetic on favorite.created_at, a security
 * control on user_session.expires_at. Corollary followed everywhere in the auth
 * code: every expiry is computed and compared in SQL, never with Date.now().
 * @param pgm
 */
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
   * User device — one ECDSA P-256 keypair per install. The private half is a
   * non-extractable CryptoKey in the browser's IndexedDB and never leaves it.
   *
   * `public_key` is globally unique, so a revoked device key can never be
   * re-registered. That is deliberate: a revoked key stays dead.
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
   * User session — opaque 32-byte CSPRNG token, stored hashed, 15 minute TTL,
   * renewed silently by the extension signing a fresh challenge.
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
   * Auth challenge — single-use nonce, bound both to the public key it was issued
   * for and to the purpose it may be spent on.
   *
   * `purpose` is not in the original design. Without it, usages are separated only
   * by which table the route looks the key up in; that holds today, but /auth/rotate
   * will also sign with the master key against "user", and a device-register nonce
   * would become spendable there. Named `purpose` and not `usage` because USAGE is
   * a Postgres keyword.
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

  // No index on auth_challenge.public_key: consumption always goes through the
  // primary key, with public_key and purpose as extra WHERE predicates. The unique
  // constraints on user_session.token_hash, user_device.public_key and
  // user.master_public_key already provide the btree indexes the hot paths need.
}

/**
 * Revert to the bearer-secret schema. `secret_hash` comes back nullable: the
 * plaintext secrets are unrecoverable, so notNull cannot be restored.
 * @param pgm
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
