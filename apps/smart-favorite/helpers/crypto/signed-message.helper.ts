/**
 * Domain separation, so a signature for one usage can't be replayed for another.
 * The server builds identical bytes in apps/back/src/helpers/auth-message.helper.ts.
 * Drift shows up as a silent 401, so change both sides or neither.
 */
export const SIGNATURE_DOMAIN = {
  accountCreate: 'smart-favorites:v1:account-create',
  session: 'smart-favorites:v1:session',
  deviceRegister: 'smart-favorites:v1:device-register',
} as const

const encoder = new TextEncoder()

/**
 * ':' is outside the base64url alphabet and the field count is fixed per domain, so
 * ('a', 'bc') and ('ab', 'c') can't collide. `Uint8Array<ArrayBuffer>` here and
 * below because WebCrypto wants a BufferSource, which excludes SharedArrayBuffer.
 */
function buildSignedMessage(parts: readonly string[]): Uint8Array<ArrayBuffer> {
  return encoder.encode(parts.join(':'))
}

/** Signed by the master key when creating an account. */
export function buildAccountCreateMessage(masterPublicKey: string, devicePublicKey: string): Uint8Array<ArrayBuffer> {
  return buildSignedMessage([SIGNATURE_DOMAIN.accountCreate, masterPublicKey, devicePublicKey])
}

/** Signed by the device key to redeem a session challenge. */
export function buildSessionMessage(devicePublicKey: string, nonce: string): Uint8Array<ArrayBuffer> {
  return buildSignedMessage([SIGNATURE_DOMAIN.session, devicePublicKey, nonce])
}

/** Signed by the master key to enroll a new device. */
export function buildDeviceRegisterMessage(masterPublicKey: string, devicePublicKey: string, nonce: string): Uint8Array<ArrayBuffer> {
  return buildSignedMessage([SIGNATURE_DOMAIN.deviceRegister, masterPublicKey, devicePublicKey, nonce])
}
