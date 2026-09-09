import type { KeyObject } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createPublicKey, verify } from 'node:crypto'
import { decodeCanonicalBase64url } from './base64url'

export const MASTER_PUBLIC_KEY_BYTES = 32
export const DEVICE_PUBLIC_KEY_BYTES = 91
export const SIGNATURE_BYTES = 64

/**
 * 2^255 - 19
 */
const ED25519_FIELD_PRIME = (2n ** 255n) - 19n

const ED25519_SMALL_ORDER_KEYS = new Set([
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000080',
  '0100000000000000000000000000000000000000000000000000000000000000',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
])

/**
 * True for a small-order key: the canonical encodings, plus any y >= p that evades them.
 */
function isUnusableMasterKey(raw: Buffer): boolean {
  if (ED25519_SMALL_ORDER_KEYS.has(raw.toString('hex'))) {
    return true
  }

  const y = BigInt(`0x${Buffer.from(raw).reverse().toString('hex')}`) & ((2n ** 255n) - 1n)

  return y >= ED25519_FIELD_PRIME
}

/**
 * Imports an ed25519 public key, null when the encoding or key material is bad.
 */
export function importMasterPublicKey(publicKey: string): KeyObject | null {
  const raw = decodeCanonicalBase64url(publicKey, MASTER_PUBLIC_KEY_BYTES)
  if (!raw || isUnusableMasterKey(raw)) {
    return null
  }

  try {
    return createPublicKey({
      format: 'jwk',
      key: { kty: 'OKP', crv: 'Ed25519', x: publicKey },
    })
  }
  catch {
    return null
  }
}

/**
 * Imports a P-256 public key, null on bad DER or on any other curve.
 */
export function importDevicePublicKey(publicKey: string): KeyObject | null {
  const der = decodeCanonicalBase64url(publicKey, DEVICE_PUBLIC_KEY_BYTES)
  if (!der) {
    return null
  }

  try {
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' })
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
      return null
    }

    return key
  }
  catch {
    return null
  }
}

/**
 * Message must be the exact bytes from message.ts.
 */
export function verifyMasterSignature(publicKey: string, message: Buffer, signature: string): boolean {
  const key = importMasterPublicKey(publicKey)
  const rawSignature = decodeCanonicalBase64url(signature, SIGNATURE_BYTES)
  if (!key || !rawSignature) {
    return false
  }

  return verify(null, message, key, rawSignature)
}

/**
 * Signature is raw r||s, 64 bytes, base64url.
 */
export function verifyDeviceSignature(publicKey: string, message: Buffer, signature: string): boolean {
  const key = importDevicePublicKey(publicKey)
  const rawSignature = decodeCanonicalBase64url(signature, SIGNATURE_BYTES)
  if (!key || !rawSignature) {
    return false
  }

  return verify('sha256', message, { key, dsaEncoding: 'ieee-p1363' }, rawSignature)
}
