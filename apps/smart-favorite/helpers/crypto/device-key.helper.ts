import type { StoredDeviceKey } from '~helpers/crypto/device-key-store.helper'
import { bytesToBase64Url } from '~helpers/crypto/base64url.helper'
import { readDeviceKey, writeDeviceKey } from '~helpers/crypto/device-key-store.helper'

const DEVICE_KEY_ALGORITHM: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' }
const DEVICE_SIGN_ALGORITHM: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' }

/**
 * Generates a non-extractable device key, so a copied profile yields no usable string.
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
 * Generates a device key and persists it before any network call can orphan it.
 */
export async function createDeviceKey(): Promise<StoredDeviceKey> {
  const deviceKey = await generateDeviceKey()

  await writeDeviceKey(deviceKey)

  return deviceKey
}

/**
 * Reads the device key, generating and persisting one on first run.
 */
export async function getOrCreateDeviceKey(): Promise<StoredDeviceKey> {
  return await readDeviceKey() ?? await createDeviceKey()
}

/**
 * Signs a message as the raw 64-byte r||s the server decodes as ieee-p1363.
 */
export async function signWithDeviceKey(privateKey: CryptoKey, message: Uint8Array<ArrayBuffer>): Promise<string> {
  const signature = await crypto.subtle.sign(DEVICE_SIGN_ALGORITHM, privateKey, message)

  return bytesToBase64Url(new Uint8Array(signature))
}
