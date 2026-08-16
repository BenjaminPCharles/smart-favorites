import type { KeyObject } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createPublicKey, verify } from 'node:crypto'
import { decodeCanonicalBase64url } from './base64url.helper'

/**
 * Ed25519 raw public key, as produced by @noble/curves in the extension.
 * On the wire: 32 raw bytes, canonical base64url, 43 characters.
 */
export const MASTER_PUBLIC_KEY_BYTES = 32
/**
 * P-256 SPKI DER, as produced by crypto.subtle.exportKey('spki', …).
 * On the wire: 91 bytes, canonical base64url, 122 characters.
 *
 * The asymmetry with the master key is deliberate. @noble/curves hands the client
 * 32 raw bytes and that string is literally the JWK `x`, so raw is free on both
 * sides. WebCrypto exports a device public key as SPKI in one call and works on a
 * pair whose private half is non-extractable, whereas 'raw' would give a 65-byte
 * point the server would have to wrap in DER itself.
 */
export const DEVICE_PUBLIC_KEY_BYTES = 91
/** Ed25519 and P-256 ieee-p1363 signatures are both 64 bytes. */
export const SIGNATURE_BYTES = 64

/** 2^255 - 19, the Ed25519 field prime. */
const ED25519_FIELD_PRIME = (2n ** 255n) - 19n

/**
 * The 8 canonical encodings of the Ed25519 8-torsion subgroup — the points of
 * small order.
 *
 * Node performs cofactorless verification, so it accepts a signature made under a
 * small-order public key without anyone possessing a private key: verification
 * reduces to an identity that holds for roughly one message in eight. Measured, not
 * assumed — an all-zero key and an all-zero signature verify over some messages and
 * not others.
 *
 * The impact on this design is limited (a small-order key can only ever belong to
 * an account its own submitter created, and a BIP39-derived key is never one of
 * these), but "a signature verifies without a private key" is precisely what this
 * model exists to prevent, so the keys are refused outright.
 *
 * Computed by enumerating l·R for random curve points R, not recited.
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
 * Reject an Ed25519 public key that is unusable as an authenticator.
 *
 * Two checks, which together cover every small-order key:
 * - the 8 canonical small-order encodings, listed above;
 * - any encoding whose y coordinate is not a canonical field element (y >= p),
 *   which is how the same small-order points could otherwise be smuggled past the
 *   list. Rejecting y >= p is also just what "canonical" means for an Ed25519 key.
 * @param raw the 32 decoded key bytes
 * @return {boolean}
 */
function isUnusableMasterKey(raw: Buffer): boolean {
  if (ED25519_SMALL_ORDER_KEYS.has(raw.toString('hex'))) {
    return true
  }

  // Little-endian, with bit 255 carrying the sign of x rather than part of y
  const y = BigInt(`0x${Buffer.from(raw).reverse().toString('hex')}`) & ((2n ** 255n) - 1n)

  return y >= ED25519_FIELD_PRIME
}

/**
 * Import an Ed25519 master public key sent as 32 raw bytes, base64url.
 *
 * The canonical base64url string of the raw key is exactly the JWK `x` member, so
 * no DER header has to be hardcoded here.
 * @param publicKey
 * @return {KeyObject | null} null when the encoding or the key material is invalid
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
    // createPublicKey throws on malformed key material, unlike verify()
    return null
  }
}

/**
 * Import a device public key sent as P-256 SPKI DER, base64url.
 *
 * The key type is asserted explicitly: createPublicKey happily imports an RSA or
 * secp384r1 SPKI of the right length, and verify() would then run on parameters
 * chosen by the caller instead of ours.
 * @param publicKey
 * @return {KeyObject | null} null when the encoding, the DER or the curve is wrong
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
 * Verify an Ed25519 signature made by a master key.
 * @param publicKey base64url, 32 raw bytes
 * @param message exact bytes from auth-message.helper
 * @param signature base64url, 64 bytes
 * @return {boolean}
 */
export function verifyMasterSignature(publicKey: string, message: Buffer, signature: string): boolean {
  const key = importMasterPublicKey(publicKey)
  const rawSignature = decodeCanonicalBase64url(signature, SIGNATURE_BYTES)
  if (!key || !rawSignature) {
    return false
  }

  // null algorithm: Ed25519 hashes internally, there is nothing to choose
  return verify(null, message, key, rawSignature)
}

/**
 * Verify an ECDSA P-256 signature made by a device key.
 * @param publicKey base64url, 91 bytes of SPKI DER
 * @param message exact bytes from auth-message.helper
 * @param signature base64url, 64 bytes of raw r||s
 * @return {boolean}
 */
export function verifyDeviceSignature(publicKey: string, message: Buffer, signature: string): boolean {
  const key = importDevicePublicKey(publicKey)
  const rawSignature = decodeCanonicalBase64url(signature, SIGNATURE_BYTES)
  if (!key || !rawSignature) {
    return false
  }

  // ieee-p1363: WebCrypto emits raw r||s, node would otherwise expect ASN.1 DER
  return verify('sha256', message, { key, dsaEncoding: 'ieee-p1363' }, rawSignature)
}
