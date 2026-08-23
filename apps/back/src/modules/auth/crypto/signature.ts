import type { KeyObject } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createPublicKey, verify } from 'node:crypto'
import { decodeCanonicalBase64url } from './base64url'

/** Ed25519 raw key from @noble/curves: 32 bytes, base64url, 43 chars on the wire. */
export const MASTER_PUBLIC_KEY_BYTES = 32
/**
 * P-256 SPKI DER from crypto.subtle.exportKey('spki', …): 91 bytes, 122 chars.
 * Different shape from the master key because WebCrypto exports SPKI in one call on
 * a non-extractable pair, where 'raw' gives a 65-byte point we'd wrap in DER.
 */
export const DEVICE_PUBLIC_KEY_BYTES = 91
/** Ed25519 and P-256 ieee-p1363 signatures are both 64 bytes. */
export const SIGNATURE_BYTES = 64

/** 2^255 - 19 */
const ED25519_FIELD_PRIME = (2n ** 255n) - 19n

/**
 * The 8 canonical encodings of the Ed25519 8-torsion subgroup. Node verifies
 * cofactorlessly, so under one of these a signature verifies with nobody holding a
 * private key, roughly one message in eight. Enumerated from l·R, not copy-pasted.
 */
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
 * Two checks cover every small-order key: the 8 canonical encodings above, plus any
 * y >= p, which is how those same points sneak past the list.
 */
function isUnusableMasterKey(raw: Buffer): boolean {
  if (ED25519_SMALL_ORDER_KEYS.has(raw.toString('hex'))) {
    return true
  }

  // Little-endian, bit 255 is the sign of x and not part of y
  const y = BigInt(`0x${Buffer.from(raw).reverse().toString('hex')}`) & ((2n ** 255n) - 1n)

  return y >= ED25519_FIELD_PRIME
}

/**
 * Null if the encoding or key material is bad. The base64url string is already the
 * JWK `x`, so there's no DER header to hardcode.
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
    // createPublicKey throws on malformed material, unlike verify()
    return null
  }
}

/**
 * Null on a bad encoding, bad DER or the wrong curve. The curve check matters:
 * createPublicKey happily imports an RSA or secp384r1 SPKI of the right length, and
 * verify() would then run on parameters the caller picked.
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

/** Message must be the exact bytes from message.ts. */
export function verifyMasterSignature(publicKey: string, message: Buffer, signature: string): boolean {
  const key = importMasterPublicKey(publicKey)
  const rawSignature = decodeCanonicalBase64url(signature, SIGNATURE_BYTES)
  if (!key || !rawSignature) {
    return false
  }

  // null algorithm, Ed25519 hashes internally
  return verify(null, message, key, rawSignature)
}

/** Signature is raw r||s, 64 bytes, base64url. */
export function verifyDeviceSignature(publicKey: string, message: Buffer, signature: string): boolean {
  const key = importDevicePublicKey(publicKey)
  const rawSignature = decodeCanonicalBase64url(signature, SIGNATURE_BYTES)
  if (!key || !rawSignature) {
    return false
  }

  // ieee-p1363 because WebCrypto emits raw r||s, node defaults to ASN.1 DER
  return verify('sha256', message, { key, dsaEncoding: 'ieee-p1363' }, rawSignature)
}
