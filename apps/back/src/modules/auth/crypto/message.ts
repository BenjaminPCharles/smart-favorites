import { Buffer } from 'node:buffer'

const MESSAGE_PREFIX = 'smart-favorites:v1'

export type MessageUsage = 'account-create' | 'session' | 'device-register'

/**
 * The exact bytes a client signs, ':' separated so no two part splits can collide.
 */
function buildMessage(usage: MessageUsage, parts: string[]): Buffer {
  return Buffer.from([MESSAGE_PREFIX, usage, ...parts].join(':'), 'utf8')
}

/**
 * Signed by the master key when creating an account.
 */
export function accountCreateMessage(masterPublicKey: string, devicePublicKey: string): Buffer {
  return buildMessage('account-create', [masterPublicKey, devicePublicKey])
}

/**
 * Signed by the device key to redeem a session challenge.
 */
export function sessionMessage(devicePublicKey: string, nonce: string): Buffer {
  return buildMessage('session', [devicePublicKey, nonce])
}

/**
 * Signed by the master key to enroll a new device.
 */
export function deviceRegisterMessage(masterPublicKey: string, devicePublicKey: string, nonce: string): Buffer {
  return buildMessage('device-register', [masterPublicKey, devicePublicKey, nonce])
}
