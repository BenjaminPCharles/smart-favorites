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

export const MAX_ACTIVE_DEVICES = 20

export interface AuthenticatedUser {
  id: number
  publicId: string
  deviceId: number
  deviceUuid: string
  sessionId: number
}

export type CreateAccountResult
  = | { status: 'created', publicId: string, deviceUuid: string }
    | { status: 'unauthorized' }
    | { status: 'conflict' }
    | { status: 'failed' }

export type OpenSessionResult
  = | { status: 'opened', sessionToken: string, expiresIn: number }
    | { status: 'unauthorized' }

export type EnrollDeviceResult
  = | { status: 'enrolled', deviceUuid: string }
    | { status: 'already-enrolled', deviceUuid: string }
    | { status: 'device-limit' }
    | { status: 'unauthorized' }

/**
 * Creates an account from a master public key plus a first device key, minting no session.
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
    if (isUniqueViolation(error)) {
      return { status: 'conflict' }
    }

    throw error
  }
}

/**
 * Issues a single-use nonce without looking the key up, which would be an enumeration oracle.
 */
export async function issueAuthChallenge(db: Pool, input: AuthChallengeBody): Promise<IssuedChallenge> {
  return 'devicePublicKey' in input
    ? issueChallenge(db, input.devicePublicKey, 'session')
    : issueChallenge(db, input.masterPublicKey, 'device-register')
}

/**
 * Exchanges a signed challenge for an opaque session token, verifying before spending the nonce.
 */
export async function openSession(db: Pool, input: AuthSessionBody): Promise<OpenSessionResult> {
  const { devicePublicKey, nonce, signature } = input

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

  return { status: 'opened', sessionToken, expiresIn: SESSION_TTL_SECONDS }
}

/**
 * Enrolls a device key on an existing account, the master signature standing in for a session.
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

  const state = await findEnrollmentState(db, masterPublicKey, devicePublicKey)

  if (state.deviceUuid) {
    return { status: 'already-enrolled', deviceUuid: state.deviceUuid }
  }

  if (state.activeDevices >= MAX_ACTIVE_DEVICES) {
    return { status: 'device-limit' }
  }

  return { status: 'unauthorized' }
}

/**
 * Resolves a session token to its user, or null when it is unknown, expired or revoked.
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
