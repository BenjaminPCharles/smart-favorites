import { Buffer } from 'node:buffer'

/**
 * Domain separation prefix. Every signed message starts with it, so a signature
 * obtained for one usage can never be replayed for another.
 *
 * CANONICAL DEFINITION — the extension builds byte-identical messages in
 * apps/smart-favorite/helpers/crypto/signed-message.helper.ts. Both sides are
 * locked by the same golden vectors (auth-message.helper.test.ts and
 * signed-message.helper.test.ts): a drift here produces a uniform 401 with no
 * diagnostic, so the literals in those tests are the actual contract.
 */
const MESSAGE_PREFIX = 'smart-favorites:v1'

export type MessageUsage = 'account-create' | 'session' | 'device-register'

/**
 * Build the exact bytes a client must sign.
 *
 * Parts are the base64url strings as received, joined with ':'. That separator is
 * outside the base64url alphabet (A-Za-z0-9-_) and the part count is fixed per
 * usage, so the encoding is injective: ('a', 'bc') and ('ab', 'c') are different
 * messages. The server therefore never has to decode anything to verify.
 * @param usage
 * @param parts base64url encoded, canonical
 * @return {Buffer} utf8 bytes of the message
 */
function buildMessage(usage: MessageUsage, parts: string[]): Buffer {
  return Buffer.from([MESSAGE_PREFIX, usage, ...parts].join(':'), 'utf8')
}

/**
 * Message signed by the master key when creating an account.
 * @param masterPublicKey
 * @param devicePublicKey
 * @return {Buffer}
 */
export function accountCreateMessage(masterPublicKey: string, devicePublicKey: string): Buffer {
  return buildMessage('account-create', [masterPublicKey, devicePublicKey])
}

/**
 * Message signed by the device key to redeem a session challenge.
 * @param devicePublicKey
 * @param nonce
 * @return {Buffer}
 */
export function sessionMessage(devicePublicKey: string, nonce: string): Buffer {
  return buildMessage('session', [devicePublicKey, nonce])
}

/**
 * Message signed by the master key to enroll a new device.
 * @param masterPublicKey
 * @param devicePublicKey
 * @param nonce
 * @return {Buffer}
 */
export function deviceRegisterMessage(masterPublicKey: string, devicePublicKey: string, nonce: string): Buffer {
  return buildMessage('device-register', [masterPublicKey, devicePublicKey, nonce])
}
