import { z } from 'zod'
import { decodeCanonicalBase64url } from '../helpers/base64url.helper'
import { NONCE_BYTES } from '../helpers/session-token.helper'
import { DEVICE_PUBLIC_KEY_BYTES, MASTER_PUBLIC_KEY_BYTES, SIGNATURE_BYTES } from '../helpers/signature.helper'

/**
 * base64url of an exact byte length, canonical encoding only.
 *
 * z.base64url() alone is not enough: it accepts non-zero trailing bits, so
 * 'A'.repeat(43) and 'A'.repeat(42) + 'B' both pass while decoding to the same 32
 * bytes. Reusing the canonical decoder means zod and the crypto layer can never
 * disagree about what a valid key is.
 * @param bytes
 * @return {z.ZodType<string>}
 */
function base64urlBytes(bytes: number): z.ZodType<string> {
  return z.base64url().refine(value => decodeCanonicalBase64url(value, bytes) !== null)
}

const masterPublicKey = base64urlBytes(MASTER_PUBLIC_KEY_BYTES)
const devicePublicKey = base64urlBytes(DEVICE_PUBLIC_KEY_BYTES)
const signature = base64urlBytes(SIGNATURE_BYTES)
const nonce = base64urlBytes(NONCE_BYTES)

/**
 * Device label — display-only metadata for the devices screen. Bounded so it
 * cannot be a storage-inflation vector, and control-character-free so it can never
 * carry a terminal escape or a line break into a log line.
 *
 * Deliberately not part of any signed message: it keeps one less thing that client
 * and server must agree on byte for byte, and the only attacker who could tamper
 * with it has already broken TLS.
 */
const label = z.string().trim().min(1).max(64).regex(/^\P{C}+$/u).optional()

// z.strictObject, not z.object: a mistyped field name must fail loudly rather than
// be silently dropped — and on /auth/challenge it is what makes "exactly one of the
// two keys" enforceable.
export const authInitBodySchema = z.strictObject({ masterPublicKey, devicePublicKey, signature, label })
export const authChallengeBodySchema = z.union([
  z.strictObject({ devicePublicKey }),
  z.strictObject({ masterPublicKey }),
])
export const authSessionBodySchema = z.strictObject({ devicePublicKey, nonce, signature })
export const authDeviceBodySchema = z.strictObject({ masterPublicKey, devicePublicKey, nonce, signature, label })
