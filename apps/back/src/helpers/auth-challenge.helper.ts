import type { Pool } from 'pg'
import { CHALLENGE_TTL_SECONDS, generateNonce } from './session-token.helper'

/**
 * What a nonce may be spent on. Bound at issuance and matched at consumption, so
 * nonce-level domain separation mirrors the message-level prefixes instead of
 * relying on them.
 */
export type ChallengePurpose = 'session' | 'device-register'

export interface IssuedChallenge {
  nonce: string
  expiresAt: Date
}

/**
 * Issue a nonce bound to a public key and a purpose.
 *
 * The key is deliberately never looked up: a 404 for an unknown key would be a
 * public-key enumeration oracle, and would be pointless anyway since a nonce is
 * worthless without the matching private key. An unknown key surfaces one step
 * later, as a uniform 401.
 * @param db
 * @param publicKey
 * @param purpose
 * @return {Promise<IssuedChallenge>}
 */
export async function issueChallenge(db: Pool, publicKey: string, purpose: ChallengePurpose): Promise<IssuedChallenge> {
  // make_interval with a bound parameter rather than an interpolated literal: the TTL
  // is a constant today, so nothing is injectable — but this is the one shape in the
  // codebase that would quietly become an injection the day it comes from the env or
  // a request, and the parameterised form costs nothing.
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
 * Spend a nonce.
 *
 * A single statement, so the check and the mark are atomic: a concurrent duplicate
 * blocks on the row lock, re-evaluates the WHERE clause once released, sees used_at
 * set and matches nothing. All four failure modes — unknown, already used, expired,
 * bound to another key or purpose — collapse into one `false`, so the caller has no
 * way to tell the client which one it was.
 * @param db
 * @param nonce
 * @param publicKey the key the challenge was issued for
 * @param purpose
 * @return {Promise<boolean>} false when the nonce cannot be spent
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
 * Delete challenges that can no longer be spent.
 *
 * The grace period keeps rows readable while debugging. Deleting an expired nonce
 * is safe whether or not it was used: consumption requires the row to exist, so a
 * missing row is a refusal.
 * @param db
 * @return {Promise<number>} rows deleted
 */
export async function purgeExpiredChallenges(db: Pool): Promise<number> {
  const result = await db.query(
    'DELETE FROM auth_challenge WHERE expires_at < now() - interval \'5 minutes\'',
  )

  return result.rowCount ?? 0
}

/**
 * Delete sessions that can no longer be used. Without this, user_session grows by
 * one row per silent renewal, forever.
 * @param db
 * @return {Promise<number>} rows deleted
 */
export async function purgeExpiredSessions(db: Pool): Promise<number> {
  const result = await db.query(
    'DELETE FROM user_session WHERE expires_at < now() - interval \'1 hour\' OR revoked_at IS NOT NULL',
  )

  return result.rowCount ?? 0
}
