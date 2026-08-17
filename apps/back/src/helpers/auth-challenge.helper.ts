import type { Pool } from 'pg'
import { CHALLENGE_TTL_SECONDS, generateNonce } from './session-token.helper'

/** Bound at issuance, matched at consumption. Domain separation at the nonce level. */
export type ChallengePurpose = 'session' | 'device-register'

export interface IssuedChallenge {
  nonce: string
  expiresAt: Date
}

/**
 * We never check the key exists. A 404 on an unknown key would let anyone enumerate
 * public keys, and a nonce is useless without the private half. Fails later as a 401.
 */
export async function issueChallenge(db: Pool, publicKey: string, purpose: ChallengePurpose): Promise<IssuedChallenge> {
  // TTL bound as a parameter, not interpolated. Constant today, but this is the one
  // query that becomes an injection the day the value comes from the env.
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
 * One statement, so check and mark are atomic: a concurrent duplicate blocks on the
 * row lock then matches nothing. Unknown, used, expired and wrong key/purpose all
 * return the same false, so callers can't leak which it was.
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
 * Delete challenges that can no longer be spent. The 5 minute grace period just
 * keeps rows around long enough to be useful when debugging.
 */
export async function purgeExpiredChallenges(db: Pool): Promise<number> {
  const result = await db.query(
    'DELETE FROM auth_challenge WHERE expires_at < now() - interval \'5 minutes\'',
  )

  return result.rowCount ?? 0
}

/** Without this, user_session grows by one row per silent renewal, forever. */
export async function purgeExpiredSessions(db: Pool): Promise<number> {
  const result = await db.query(
    'DELETE FROM user_session WHERE expires_at < now() - interval \'1 hour\' OR revoked_at IS NOT NULL',
  )

  return result.rowCount ?? 0
}
