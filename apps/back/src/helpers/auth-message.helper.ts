import { Buffer } from 'node:buffer'

/**
 * Domain separation, so a signature for one usage can't be replayed for another.
 * The extension builds identical bytes in helpers/crypto/signed-message.helper.ts.
 * Drift shows up as a silent 401, so change both sides or neither.
 */
const MESSAGE_PREFIX = 'smart-favorites:v1'

export type MessageUsage = 'account-create' | 'session' | 'device-register'

/**
 * The exact bytes a client signs. ':' is outside the base64url alphabet and the part
 * count is fixed per usage, so ('a', 'bc') and ('ab', 'c') can't collide. Nothing
 * needs decoding to verify.
 */
function buildMessage(usage: MessageUsage, parts: string[]): Buffer {
  return Buffer.from([MESSAGE_PREFIX, usage, ...parts].join(':'), 'utf8')
}

/** Signed by the master key when creating an account. */
export function accountCreateMessage(masterPublicKey: string, devicePublicKey: string): Buffer {
  return buildMessage('account-create', [masterPublicKey, devicePublicKey])
}

/** Signed by the device key to redeem a session challenge. */
export function sessionMessage(devicePublicKey: string, nonce: string): Buffer {
  return buildMessage('session', [devicePublicKey, nonce])
}

/** Signed by the master key to enroll a new device. */
export function deviceRegisterMessage(masterPublicKey: string, devicePublicKey: string, nonce: string): Buffer {
  return buildMessage('device-register', [masterPublicKey, devicePublicKey, nonce])
}
