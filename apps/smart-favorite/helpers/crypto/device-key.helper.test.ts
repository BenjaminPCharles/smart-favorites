import { Buffer } from 'node:buffer'
import { createPublicKey, verify } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { base64UrlToBytes } from '~helpers/crypto/base64url.helper'

// IndexedDB does not exist in the node environment, and fake-indexeddb's structured
// clone cannot round-trip a CryptoKey — a green test against it would be a lie. The
// store is therefore mocked here and covered by the manual QA checklist instead.
vi.mock('~helpers/crypto/device-key-store.helper', () => ({
  readDeviceKey: vi.fn(),
  writeDeviceKey: vi.fn(),
  deleteDeviceKey: vi.fn(),
}))

const { createDeviceKey, generateDeviceKey, getOrCreateDeviceKey, signWithDeviceKey } = await import('~helpers/crypto/device-key.helper')
const store = await import('~helpers/crypto/device-key-store.helper')

/** The SPKI prefix every P-256 public key shares. */
const P256_SPKI_PREFIX = '3059301306072a8648ce3d020106082a8648ce3d030107034200'

describe('device-key.helper', () => {
  beforeEach(() => {
    vi.mocked(store.readDeviceKey).mockReset()
    vi.mocked(store.writeDeviceKey).mockReset()
  })

  it('generates a non-extractable signing key', async () => {
    const deviceKey = await createDeviceKey()

    expect(deviceKey.privateKey.extractable).toBe(false)
    expect(deviceKey.privateKey.usages).toEqual(['sign'])
    // The assertion that non-extractability is real and not aspirational
    await expect(crypto.subtle.exportKey('pkcs8', deviceKey.privateKey)).rejects.toThrow()
  })

  it('persists the key before returning, so an interrupted onboarding cannot lose it', async () => {
    const deviceKey = await createDeviceKey()

    expect(store.writeDeviceKey).toHaveBeenCalledWith(deviceKey)
  })

  it('generates without persisting, which is what device enrolment needs', async () => {
    // restoreDevice writes the key only once the server has accepted it: writing it
    // first turns a failed enrolment into a `device-ready` extension holding a key
    // nobody knows, with no way back to the restore screen
    await generateDeviceKey()

    expect(store.writeDeviceKey).not.toHaveBeenCalled()
  })

  it('exports the public key in the 91-byte SPKI wire format', async () => {
    const deviceKey = await createDeviceKey()
    const raw = base64UrlToBytes(deviceKey.publicKeyB64Url)

    expect(deviceKey.publicKeyB64Url).toHaveLength(122)
    expect(raw).toHaveLength(91)
    expect(Buffer.from(raw).toString('hex')).toMatch(new RegExp(`^${P256_SPKI_PREFIX}`))
  })

  it('signs in the 64-byte ieee-p1363 format the server verifies', async () => {
    const deviceKey = await createDeviceKey()
    const message = new TextEncoder().encode('smart-favorites:v1:session:key:nonce')
    const signature = await signWithDeviceKey(deviceKey.privateKey, message)

    // 64 bytes is what locks ieee-p1363: the day this becomes ~70 bytes of ASN.1
    // DER, the server rejects every request in silence
    expect(base64UrlToBytes(signature)).toHaveLength(64)

    // Exactly what apps/back/src/helpers/signature.helper.ts does
    const serverKey = createPublicKey({
      key: Buffer.from(base64UrlToBytes(deviceKey.publicKeyB64Url)),
      format: 'der',
      type: 'spki',
    })

    expect(verify('sha256', message, { key: serverKey, dsaEncoding: 'ieee-p1363' }, base64UrlToBytes(signature))).toBe(true)
    expect(verify('sha256', new TextEncoder().encode('other'), { key: serverKey, dsaEncoding: 'ieee-p1363' }, base64UrlToBytes(signature))).toBe(false)
  })

  it('reuses a stored key rather than generating a second one', async () => {
    const existing = await createDeviceKey()
    vi.mocked(store.writeDeviceKey).mockClear()
    vi.mocked(store.readDeviceKey).mockResolvedValue(existing)

    expect(await getOrCreateDeviceKey()).toBe(existing)
    expect(store.writeDeviceKey).not.toHaveBeenCalled()
  })
})
