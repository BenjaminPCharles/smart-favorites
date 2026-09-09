import type { Pool } from 'pg'
import { CHALLENGE_TTL_SECONDS, generateNonce } from './crypto/session-token'

export type ChallengePurpose = 'session' | 'device-register'

export interface IssuedChallenge {
  nonce: string
  expiresAt: Date
}

export interface AccountRow {
  publicId: string
  deviceUuid: string
}

export interface EnrollmentState {
  deviceUuid: string | null
  activeDevices: number
}

export interface LiveSessionRow {
  session_id: number
  token_hash: string
  device_id: number
  device_uuid: string
  user_id: number
  public_id: string
}

/**
 * Stores a nonce without checking the key exists, which would be an enumeration oracle.
 */
export async function issueChallenge(db: Pool, publicKey: string, purpose: ChallengePurpose): Promise<IssuedChallenge> {
  const result = await db.query<{ nonce: string, expires_at: Date }>(
    `INSERT INTO auth_challenge (nonce, public_key, purpose, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4))
     RETURNING nonce, expires_at`,
    [generateNonce(), publicKey, purpose, CHALLENGE_TTL_SECONDS],
  )

  const row = result.rows[0]
  if (!row) {
    throw new Error('Could not issue a challenge')
  }

  return { nonce: row.nonce, expiresAt: row.expires_at }
}

/**
 * Atomically spends a nonce, returning the same false for every reason it can fail.
 */
export async function consumeChallenge(db: Pool, nonce: string, publicKey: string, purpose: ChallengePurpose): Promise<boolean> {
  const result = await db.query(
    `UPDATE auth_challenge
     SET used_at = now()
     WHERE nonce = $1
       AND public_key = $2
       AND purpose = $3
       AND used_at IS NULL
       AND expires_at > now()
     RETURNING nonce`,
    [nonce, publicKey, purpose],
  )

  return result.rowCount === 1
}

/**
 * Deletes challenges that can no longer be spent, after a short debugging grace period.
 */
export async function purgeExpiredChallenges(db: Pool): Promise<number> {
  const result = await db.query(
    'DELETE FROM auth_challenge WHERE expires_at < now() - interval \'5 minutes\'',
  )

  return result.rowCount ?? 0
}

/**
 * Without this, user_session grows by one row per silent renewal, forever.
 */
export async function purgeExpiredSessions(db: Pool): Promise<number> {
  const result = await db.query(
    'DELETE FROM user_session WHERE expires_at < now() - interval \'1 hour\' OR revoked_at IS NOT NULL',
  )

  return result.rowCount ?? 0
}

/**
 * Null if the insert returned no row. Raises pg's unique violation, the caller turns it into a 409.
 */
export async function insertAccountWithDevice(db: Pool, masterPublicKey: string, devicePublicKey: string, label: string | null): Promise<AccountRow | null> {
  const result = await db.query<{ public_id: string, device_uuid: string }>(
    `WITH created_user AS (
       INSERT INTO "user" (master_public_key) VALUES ($1)
       RETURNING id, public_id
     ),
     created_device AS (
       INSERT INTO user_device (user_id, public_key, label)
       SELECT id, $2, $3 FROM created_user
       RETURNING uuid, user_id
     )
     SELECT cu.public_id, cd.uuid AS device_uuid
     FROM created_user cu
     JOIN created_device cd ON cd.user_id = cu.id`,
    [masterPublicKey, devicePublicKey, label],
  )

  const row = result.rows[0]

  return row ? { publicId: row.public_id, deviceUuid: row.device_uuid } : null
}

/**
 * Null for an unknown key and for a revoked device alike, so neither is nameable.
 */
export async function findActiveDeviceId(db: Pool, devicePublicKey: string): Promise<number | null> {
  const result = await db.query<{ id: number }>(
    'SELECT id FROM user_device WHERE public_key = $1 AND revoked_at IS NULL',
    [devicePublicKey],
  )

  return result.rows[0]?.id ?? null
}

export async function insertSession(db: Pool, deviceId: number, tokenHash: string, ttlSeconds: number): Promise<void> {
  await db.query(
    `INSERT INTO user_session (device_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [deviceId, tokenHash, ttlSeconds],
  )
}

/**
 * Enrolls a device under the cap, null covering unknown account, cap and known key alike.
 */
export async function insertDeviceWithinCap(db: Pool, masterPublicKey: string, devicePublicKey: string, label: string | null, maxActiveDevices: number): Promise<string | null> {
  const result = await db.query<{ uuid: string }>(
    `WITH target_user AS (
       SELECT id FROM "user" WHERE master_public_key = $1
     ),
     within_cap AS (
       SELECT tu.id
       FROM target_user tu
       WHERE (
         SELECT count(*) FROM user_device d
         WHERE d.user_id = tu.id AND d.revoked_at IS NULL
       ) < $4
     )
     INSERT INTO user_device (user_id, public_key, label)
     SELECT id, $2, $3 FROM within_cap
     ON CONFLICT (public_key) DO NOTHING
     RETURNING uuid`,
    [masterPublicKey, devicePublicKey, label, maxActiveDevices],
  )

  return result.rows[0]?.uuid ?? null
}

/**
 * One query to tell an unknown account, a reached cap and an already-enrolled key apart.
 */
export async function findEnrollmentState(db: Pool, masterPublicKey: string, devicePublicKey: string): Promise<EnrollmentState> {
  const result = await db.query<{ uuid: string | null, active_devices: string }>(
    `SELECT
       (SELECT d.uuid FROM user_device d
        JOIN "user" u ON u.id = d.user_id
        WHERE d.public_key = $2 AND u.master_public_key = $1 AND d.revoked_at IS NULL) AS uuid,
       (SELECT count(*) FROM user_device d
        JOIN "user" u ON u.id = d.user_id
        WHERE u.master_public_key = $1 AND d.revoked_at IS NULL) AS active_devices`,
    [masterPublicKey, devicePublicKey],
  )
  const row = result.rows[0]

  return {
    deviceUuid: row?.uuid ?? null,
    activeDevices: Number(row?.active_devices ?? 0),
  }
}

/**
 * The hot path. Null covers unknown, expired, revoked and revoked-device alike.
 */
export async function findLiveSession(db: Pool, tokenHash: string): Promise<LiveSessionRow | null> {
  const result = await db.query<LiveSessionRow>(
    `WITH matched AS (
       SELECT
         s.id         AS session_id,
         s.token_hash AS token_hash,
         d.id         AS device_id,
         d.uuid       AS device_uuid,
         u.id         AS user_id,
         u.public_id  AS public_id
       FROM user_session s
       JOIN user_device d ON d.id = s.device_id
       JOIN "user" u ON u.id = d.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
         AND d.revoked_at IS NULL
     ),
     touched AS (
       UPDATE user_device
       SET last_used_at = now()
       WHERE id IN (SELECT device_id FROM matched)
         AND (last_used_at IS NULL OR last_used_at < now() - interval '5 minutes')
       RETURNING id
     )
     SELECT session_id, token_hash, device_id, device_uuid, user_id, public_id FROM matched`,
    [tokenHash],
  )

  return result.rows[0] ?? null
}
