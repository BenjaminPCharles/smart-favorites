export const SIGNATURE_DOMAIN = {
  accountCreate: 'smart-favorites:v1:account-create',
  session: 'smart-favorites:v1:session',
  deviceRegister: 'smart-favorites:v1:device-register',
} as const

const encoder = new TextEncoder()

/**
 * Joins parts with ':', outside the base64url alphabet, so no two field splits collide.
 */
function buildSignedMessage(parts: readonly string[]): Uint8Array<ArrayBuffer> {
  return encoder.encode(parts.join(':'))
}

/**
 * Signed by the master key when creating an account.
 */
export function buildAccountCreateMessage(masterPublicKey: string, devicePublicKey: string): Uint8Array<ArrayBuffer> {
  return buildSignedMessage([SIGNATURE_DOMAIN.accountCreate, masterPublicKey, devicePublicKey])
}

/**
 * Signed by the device key to redeem a session challenge.
 */
export function buildSessionMessage(devicePublicKey: string, nonce: string): Uint8Array<ArrayBuffer> {
  return buildSignedMessage([SIGNATURE_DOMAIN.session, devicePublicKey, nonce])
}

/**
 * Signed by the master key to enroll a new device.
 */
export function buildDeviceRegisterMessage(masterPublicKey: string, devicePublicKey: string, nonce: string): Uint8Array<ArrayBuffer> {
  return buildSignedMessage([SIGNATURE_DOMAIN.deviceRegister, masterPublicKey, devicePublicKey, nonce])
}
