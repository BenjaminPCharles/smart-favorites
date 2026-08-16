import type { StoredDeviceKey } from '~helpers/crypto/device-key-store.helper'
import { bytesToBase64Url } from '~helpers/crypto/base64url.helper'
import { readDeviceKey, writeDeviceKey } from '~helpers/crypto/device-key-store.helper'

const DEVICE_KEY_ALGORITHM: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' }
const DEVICE_SIGN_ALGORITHM: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' }

/**
 * Generate a device key pair, without persisting it.
 *
 * The private key is non-extractable: no JavaScript path can read it back, ours
 * included, and an infostealer that copies the profile finds no usable string. The
 * public key of a generated pair is always extractable whatever the flag says,
 * which is what lets us export the SPKI below.
 *
 * Honest limit, also in docs/AUTH.md: this is not a secure enclave — the browser
 * still writes the key material to disk — and code running inside our own extension
 * context can still *use* the key to sign. It defeats exfiltration and offline
 * reuse, not local misuse.
 *
 * Separate from createDeviceKey because the two callers need opposite orderings.
 * Account creation must persist first (the server is about to hold this key, so it
 * may never exist only in a promise that got dropped); device enrolment must persist
 * last, once the server has accepted it — writing it early leaves the extension
 * holding a key nobody knows. See restoreDevice in onboarding.helper.
 * @return {Promise<StoredDeviceKey>}
 */
export async function generateDeviceKey(): Promise<StoredDeviceKey> {
  const keyPair = await crypto.subtle.generateKey(DEVICE_KEY_ALGORITHM, false, ['sign', 'verify'])
  const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey)

  return {
    privateKey: keyPair.privateKey,
    publicKeyB64Url: bytesToBase64Url(new Uint8Array(spki)),
    createdAt: Date.now(),
  }
}

/**
 * Generate a device key pair and persist it before returning.
 *
 * Persisted before any network call, so an interrupted onboarding can never leave an
 * account whose key exists nowhere.
 * @return {Promise<StoredDeviceKey>}
 */
export async function createDeviceKey(): Promise<StoredDeviceKey> {
  const deviceKey = await generateDeviceKey()

  await writeDeviceKey(deviceKey)

  return deviceKey
}

/**
 * Read the device key, generating and persisting one on first run.
 * @return {Promise<StoredDeviceKey>}
 */
export async function getOrCreateDeviceKey(): Promise<StoredDeviceKey> {
  return await readDeviceKey() ?? await createDeviceKey()
}

/**
 * Sign a message with the device key.
 *
 * WebCrypto ECDSA emits raw r||s — 64 bytes for P-256 — which is exactly what the
 * server's `dsaEncoding: 'ieee-p1363'` consumes. There is no DER re-encoding step
 * on either side, and the 64-byte length is asserted in the tests because the day
 * it becomes ~70 the server rejects everything in silence.
 * @param privateKey
 * @param message
 * @return {Promise<string>} base64url signature
 */
export async function signWithDeviceKey(privateKey: CryptoKey, message: Uint8Array<ArrayBuffer>): Promise<string> {
  const signature = await crypto.subtle.sign(DEVICE_SIGN_ALGORITHM, privateKey, message)

  return bytesToBase64Url(new Uint8Array(signature))
}
