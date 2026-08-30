import type { Pool } from 'pg'
import type { IssuedChallenge } from './auth.repository'
import type { AuthChallengeBody, AuthDeviceBody, AuthInitBody, AuthSessionBody } from './auth.schema'
import { isUniqueViolation } from '../../shared/db/pg-error'
import {
  consumeChallenge,
  findActiveDeviceId,
  findEnrollmentState,
  findLiveSession,
  insertAccountWithDevice,
  insertDeviceWithinCap,
  insertSession,
  issueChallenge,
} from './auth.repository'
import { accountCreateMessage, deviceRegisterMessage, sessionMessage } from './crypto/message'
import { generateSessionToken, hashSessionToken, SESSION_TTL_SECONDS, sessionTokenMatchesHash } from './crypto/session-token'
import { verifyDeviceSignature, verifyMasterSignature } from './crypto/signature'

// The auth rules: what gets verified, in which order, and what each outcome means.
// Statuses rather than HTTP codes, so a flow is testable without a request. auth.routes.ts maps them.

/** Soft cap, so one stolen mnemonic can't enroll devices forever. */
export const MAX_ACTIVE_DEVICES = 20

export interface AuthenticatedUser {
  id: number
  publicId: string
  /**
   * Which device this session belongs to. Makes a compromise attributable, and the
   * per-device revocation screen needs it.
   */
  deviceId: number
  deviceUuid: string
  /** Kept so a session can be revoked without a second lookup. */
  sessionId: number
}

export type CreateAccountResult
  = | { status: 'created', publicId: string, deviceUuid: string }
    | { status: 'unauthorized' }
    | { status: 'conflict' }
    // 'failed': the insert returned no row. Not a caller error, so it surfaces as a 500.
    | { status: 'failed' }

export type OpenSessionResult
  = | { status: 'opened', sessionToken: string, expiresIn: number }
    | { status: 'unauthorized' }

export type EnrollDeviceResult
  = | { status: 'enrolled', deviceUuid: string }
    // 'already-enrolled': this key is already active on this account, so a retry rather than an error.
    | { status: 'already-enrolled', deviceUuid: string }
    | { status: 'device-limit' }
    | { status: 'unauthorized' }

/**
 * Create an account from a master public key plus a first device key. The master
 * signature is the auth, nobody but the key holder reaches the insert. No session
 * comes back, so only openSession ever mints one.
 */
export async function createAccount(db: Pool, input: AuthInitBody): Promise<CreateAccountResult> {
  const { masterPublicKey, devicePublicKey, signature, label } = input

  if (!verifyMasterSignature(masterPublicKey, accountCreateMessage(masterPublicKey, devicePublicKey), signature)) {
    return { status: 'unauthorized' }
  }

  try {
    const account = await insertAccountWithDevice(db, masterPublicKey, devicePublicKey, label ?? null)
    if (!account) {
      return { status: 'failed' }
    }

    return { status: 'created', publicId: account.publicId, deviceUuid: account.deviceUuid }
  }
  catch (error) {
    // Safe to be specific: we only get here once the master signature verified.
    // Not idempotent on purpose, "master exists so just enroll the device" would
    // be a nonce-free enrolment endpoint bypassing enrollDevice's challenge.
    if (isUniqueViolation(error)) {
      return { status: 'conflict' }
    }

    throw error
  }
}

/**
 * Single-use nonce, for a device key (open a session) or a master key (enroll a
 * device). The key is never looked up: answering "unknown key" is an enumeration
 * oracle, and a nonce is useless without the private half.
 */
export async function issueAuthChallenge(db: Pool, input: AuthChallengeBody): Promise<IssuedChallenge> {
  return 'devicePublicKey' in input
    ? issueChallenge(db, input.devicePublicKey, 'session')
    : issueChallenge(db, input.masterPublicKey, 'device-register')
}

/** Exchange a signed challenge for an opaque session token. */
export async function openSession(db: Pool, input: AuthSessionBody): Promise<OpenSessionResult> {
  const { devicePublicKey, nonce, signature } = input

  // Signature first, nonce spent second. A nonce isn't a secret, so consuming it
  // first would let anyone who saw one burn it with a garbage signature. Replay
  // stays closed, consumption is atomic and precedes the token being minted.
  if (!verifyDeviceSignature(devicePublicKey, sessionMessage(devicePublicKey, nonce), signature)) {
    return { status: 'unauthorized' }
  }

  if (!await consumeChallenge(db, nonce, devicePublicKey, 'session')) {
    return { status: 'unauthorized' }
  }

  const deviceId = await findActiveDeviceId(db, devicePublicKey)
  if (deviceId === null) {
    return { status: 'unauthorized' }
  }

  const sessionToken = generateSessionToken()
  await insertSession(db, deviceId, hashSessionToken(sessionToken), SESSION_TTL_SECONDS)

  // Relative seconds, the extension shouldn't have to trust its own clock
  return { status: 'opened', sessionToken, expiresIn: SESSION_TTL_SECONDS }
}

/**
 * Enroll a new device key on an existing account. Needs no session because the
 * master signature *is* the auth. Only point where a user needs their recovery phrase.
 */
export async function enrollDevice(db: Pool, input: AuthDeviceBody): Promise<EnrollDeviceResult> {
  const { masterPublicKey, devicePublicKey, nonce, signature, label } = input

  if (!verifyMasterSignature(masterPublicKey, deviceRegisterMessage(masterPublicKey, devicePublicKey, nonce), signature)) {
    return { status: 'unauthorized' }
  }

  if (!await consumeChallenge(db, nonce, masterPublicKey, 'device-register')) {
    return { status: 'unauthorized' }
  }

  const deviceUuid = await insertDeviceWithinCap(db, masterPublicKey, devicePublicKey, label ?? null, MAX_ACTIVE_DEVICES)
  if (deviceUuid) {
    return { status: 'enrolled', deviceUuid }
  }

  // No uuid means unknown account, cap reached, or key already registered
  const state = await findEnrollmentState(db, masterPublicKey, devicePublicKey)

  // Retrying after a network timeout isn't an error, so an active device on this
  // same account gets a 200.
  if (state.deviceUuid) {
    return { status: 'already-enrolled', deviceUuid: state.deviceUuid }
  }

  if (state.activeDevices >= MAX_ACTIVE_DEVICES) {
    return { status: 'device-limit' }
  }

  // Unknown account, key owned by someone else, or a revoked device. All three get
  // the same 401, so this never reveals whether an account exists for a key.
  return { status: 'unauthorized' }
}

/**
 * Null when the token is missing, unknown, expired, or its device was revoked.
 */
export async function resolveSession(db: Pool, token: string): Promise<AuthenticatedUser | null> {
  const row = await findLiveSession(db, hashSessionToken(token))
  if (!row || !sessionTokenMatchesHash(token, row.token_hash)) {
    return null
  }

  return {
    id: row.user_id,
    publicId: row.public_id,
    deviceId: row.device_id,
    deviceUuid: row.device_uuid,
    sessionId: row.session_id,
  }
}
