import type { StoredDeviceKey } from '~helpers/crypto/device-key-store.helper'
import { bytesToBase64Url } from '~helpers/crypto/base64url.helper'
import { readDeviceKey, writeDeviceKey } from '~helpers/crypto/device-key-store.helper'

const DEVICE_KEY_ALGORITHM: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' }
const DEVICE_SIGN_ALGORITHM: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' }

/**
 * Non-extractable, so an infostealer copying the profile finds no usable string. Not
 * an enclave though, our own context can still sign with it. Split from
 * createDeviceKey because the callers need opposite orderings, see restoreDevice.
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
 * Written before any network call, so an interrupted onboarding can't leave behind
 * an account whose key exists nowhere.
 */
export async function createDeviceKey(): Promise<StoredDeviceKey> {
  const deviceKey = await generateDeviceKey()

  await writeDeviceKey(deviceKey)

  return deviceKey
}

/** Reads the device key, generating and persisting one on first run. */
export async function getOrCreateDeviceKey(): Promise<StoredDeviceKey> {
  return await readDeviceKey() ?? await createDeviceKey()
}

/**
 * Base64url signature. WebCrypto emits raw r||s, 64 bytes, which is what the
 * server's `dsaEncoding: 'ieee-p1363'` eats. The tests pin that length because the
 * day it becomes ~70 the server rejects everything without saying so.
 */
export async function signWithDeviceKey(privateKey: CryptoKey, message: Uint8Array<ArrayBuffer>): Promise<string> {
  const signature = await crypto.subtle.sign(DEVICE_SIGN_ALGORITHM, privateKey, message)

  return bytesToBase64Url(new Uint8Array(signature))
}
