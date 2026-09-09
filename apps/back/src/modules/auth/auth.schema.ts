import { z } from 'zod'
import { decodeCanonicalBase64url } from './crypto/base64url'
import { NONCE_BYTES } from './crypto/session-token'
import { DEVICE_PUBLIC_KEY_BYTES, MASTER_PUBLIC_KEY_BYTES, SIGNATURE_BYTES } from './crypto/signature'

/**
 * A base64url string of exactly `bytes` bytes, decoded by the crypto layer so both agree.
 */
function base64urlBytes(bytes: number): z.ZodType<string> {
  return z.base64url().refine(value => decodeCanonicalBase64url(value, bytes) !== null)
}

const masterPublicKey = base64urlBytes(MASTER_PUBLIC_KEY_BYTES)
const devicePublicKey = base64urlBytes(DEVICE_PUBLIC_KEY_BYTES)
const signature = base64urlBytes(SIGNATURE_BYTES)
const nonce = base64urlBytes(NONCE_BYTES)

const label = z.string().trim().min(1).max(64).regex(/^\P{C}+$/u).optional()

export const authInitBodySchema = z.strictObject({ masterPublicKey, devicePublicKey, signature, label })
export const authChallengeBodySchema = z.union([
  z.strictObject({ devicePublicKey }),
  z.strictObject({ masterPublicKey }),
])
export const authSessionBodySchema = z.strictObject({ devicePublicKey, nonce, signature })
export const authDeviceBodySchema = z.strictObject({ masterPublicKey, devicePublicKey, nonce, signature, label })

export type AuthInitBody = z.infer<typeof authInitBodySchema>
export type AuthChallengeBody = z.infer<typeof authChallengeBodySchema>
export type AuthSessionBody = z.infer<typeof authSessionBodySchema>
export type AuthDeviceBody = z.infer<typeof authDeviceBodySchema>
