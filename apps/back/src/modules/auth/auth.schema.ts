import { z } from 'zod'
import { decodeCanonicalBase64url } from './crypto/base64url'
import { NONCE_BYTES } from './crypto/session-token'
import { DEVICE_PUBLIC_KEY_BYTES, MASTER_PUBLIC_KEY_BYTES, SIGNATURE_BYTES } from './crypto/signature'

/**
 * z.base64url() alone accepts non-zero trailing bits, so 'A'.repeat(43) and
 * 'A'.repeat(42) + 'B' both pass while decoding to the same bytes. Reusing the
 * crypto layer's decoder means the two can't disagree on what a valid key is.
 */
function base64urlBytes(bytes: number): z.ZodType<string> {
  return z.base64url().refine(value => decodeCanonicalBase64url(value, bytes) !== null)
}

const masterPublicKey = base64urlBytes(MASTER_PUBLIC_KEY_BYTES)
const devicePublicKey = base64urlBytes(DEVICE_PUBLIC_KEY_BYTES)
const signature = base64urlBytes(SIGNATURE_BYTES)
const nonce = base64urlBytes(NONCE_BYTES)

/**
 * Display-only. Bounded so it can't inflate storage, no control chars so it can't
 * drag a terminal escape into a log line. Not signed: one less thing both sides must
 * agree on byte for byte, and tampering with it means TLS is already broken.
 */
const label = z.string().trim().min(1).max(64).regex(/^\P{C}+$/u).optional()

// strictObject, so a mistyped field name fails loudly instead of being dropped. On
// /auth/challenge it's also what makes "exactly one of the two keys" enforceable.
export const authInitBodySchema = z.strictObject({ masterPublicKey, devicePublicKey, signature, label })
export const authChallengeBodySchema = z.union([
  z.strictObject({ devicePublicKey }),
  z.strictObject({ masterPublicKey }),
])
export const authSessionBodySchema = z.strictObject({ devicePublicKey, nonce, signature })
export const authDeviceBodySchema = z.strictObject({ masterPublicKey, devicePublicKey, nonce, signature, label })

// What auth.service.ts takes: parsed output, so a service call can't be handed a raw body.
export type AuthInitBody = z.infer<typeof authInitBodySchema>
export type AuthChallengeBody = z.infer<typeof authChallengeBodySchema>
export type AuthSessionBody = z.infer<typeof authSessionBodySchema>
export type AuthDeviceBody = z.infer<typeof authDeviceBodySchema>
