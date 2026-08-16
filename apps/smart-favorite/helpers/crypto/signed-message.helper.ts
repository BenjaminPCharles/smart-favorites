/**
 * Domain separation prefixes. Every signed message starts with one, so a
 * signature obtained for one usage can never be replayed for another.
 *
 * CANONICAL DEFINITION — the server builds byte-identical messages in
 * apps/back/src/helpers/auth-message.helper.ts. Both sides are locked by the same
 * golden vectors (signed-message.helper.test.ts and auth-message.helper.test.ts):
 * a drift here produces a uniform 401 with no diagnostic, so the literals in those
 * tests are the actual contract.
 */
export const SIGNATURE_DOMAIN = {
  accountCreate: 'smart-favorites:v1:account-create',
  session: 'smart-favorites:v1:session',
  deviceRegister: 'smart-favorites:v1:device-register',
} as const

const encoder = new TextEncoder()

/**
 * Build the exact bytes both sides sign over: the domain prefix and each field
 * joined by ':'.
 *
 * Injective, because ':' is outside the base64url alphabet (A-Za-z0-9-_) and the
 * field count is fixed per domain — so ('a', 'bc') and ('ab', 'c') are different
 * messages. The server rebuilds this from the strings it already received, with no
 * decoding at all.
 *
 * `Uint8Array<ArrayBuffer>` rather than a bare `Uint8Array`, here and below: WebCrypto
 * takes a `BufferSource`, which excludes the `SharedArrayBuffer` a bare annotation
 * would allow. `TextEncoder` never returns one, so this only writes down what we
 * already produce — it keeps `crypto.subtle.sign` reachable without a cast.
 * @param parts
 * @return {Uint8Array<ArrayBuffer>}
 */
function buildSignedMessage(parts: readonly string[]): Uint8Array<ArrayBuffer> {
  return encoder.encode(parts.join(':'))
}

/**
 * Message signed by the master key when creating an account.
 * @param masterPublicKey
 * @param devicePublicKey
 * @return {Uint8Array<ArrayBuffer>}
 */
export function buildAccountCreateMessage(masterPublicKey: string, devicePublicKey: string): Uint8Array<ArrayBuffer> {
  return buildSignedMessage([SIGNATURE_DOMAIN.accountCreate, masterPublicKey, devicePublicKey])
}

/**
 * Message signed by the device key to redeem a session challenge.
 * @param devicePublicKey
 * @param nonce
 * @return {Uint8Array<ArrayBuffer>}
 */
export function buildSessionMessage(devicePublicKey: string, nonce: string): Uint8Array<ArrayBuffer> {
  return buildSignedMessage([SIGNATURE_DOMAIN.session, devicePublicKey, nonce])
}

/**
 * Message signed by the master key to enroll a new device.
 * @param masterPublicKey
 * @param devicePublicKey
 * @param nonce
 * @return {Uint8Array<ArrayBuffer>}
 */
export function buildDeviceRegisterMessage(masterPublicKey: string, devicePublicKey: string, nonce: string): Uint8Array<ArrayBuffer> {
  return buildSignedMessage([SIGNATURE_DOMAIN.deviceRegister, masterPublicKey, devicePublicKey, nonce])
}
