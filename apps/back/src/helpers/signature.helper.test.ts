import { Buffer } from 'node:buffer'
import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  importDevicePublicKey,
  importMasterPublicKey,
  verifyDeviceSignature,
  verifyMasterSignature,
} from './signature.helper'

const MESSAGE = Buffer.from('smart-favorites:v1:session:key:nonce', 'utf8')

/**
 * Build a master keypair in the wire format the extension sends: the raw 32-byte
 * Ed25519 public key, base64url.
 * @return {{ publicKey: string, sign: (message: Buffer) => string }}
 */
function createMasterKeyPair(): { publicKey: string, sign: (message: Buffer) => string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string }

  return {
    publicKey: jwk.x,
    sign: message => sign(null, message, privateKey).toString('base64url'),
  }
}

/**
 * Build a device keypair in the wire format the extension sends: P-256 SPKI DER,
 * base64url, with ieee-p1363 signatures.
 * @return {{ publicKey: string, sign: (message: Buffer) => string, signDer: (message: Buffer) => string }}
 */
function createDeviceKeyPair(): { publicKey: string, sign: (message: Buffer) => string, signDer: (message: Buffer) => string } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })

  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'),
    sign: message => sign('sha256', message, { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url'),
    signDer: message => sign('sha256', message, privateKey).toString('base64url'),
  }
}

describe('signature.helper', () => {
  describe('master (ed25519)', () => {
    it('verifies a signature over the raw-32 wire format', () => {
      const master = createMasterKeyPair()

      expect(master.publicKey).toHaveLength(43)
      expect(verifyMasterSignature(master.publicKey, MESSAGE, master.sign(MESSAGE))).toBe(true)
    })

    it('rejects a tampered message, a tampered signature and a foreign key', () => {
      const master = createMasterKeyPair()
      const other = createMasterKeyPair()
      const signature = master.sign(MESSAGE)

      expect(verifyMasterSignature(master.publicKey, Buffer.from('other message'), signature)).toBe(false)
      expect(verifyMasterSignature(master.publicKey, MESSAGE, other.sign(MESSAGE))).toBe(false)
      expect(verifyMasterSignature(other.publicKey, MESSAGE, signature)).toBe(false)
    })

    it('returns false rather than throwing on garbage input', () => {
      expect(verifyMasterSignature('not-base64url!', MESSAGE, 'nope')).toBe(false)
      expect(verifyMasterSignature('A'.repeat(43), MESSAGE, 'A'.repeat(86))).toBe(false)
    })

    it('refuses small-order keys, which verify without a private key', () => {
      // Node verifies cofactorlessly, so under a small-order key an all-zero
      // signature verifies over some messages. Every one of the 8 canonical
      // encodings must be refused at import, before verify() is ever reached.
      const smallOrder = [
        '0000000000000000000000000000000000000000000000000000000000000000',
        '0000000000000000000000000000000000000000000000000000000000000080',
        '0100000000000000000000000000000000000000000000000000000000000000',
        '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
        '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85',
        'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
        'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
        'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
      ]

      for (const hex of smallOrder) {
        const wireKey = Buffer.from(hex, 'hex').toString('base64url')
        expect(importMasterPublicKey(wireKey), hex).toBeNull()
        expect(verifyMasterSignature(wireKey, MESSAGE, 'A'.repeat(86)), hex).toBe(false)
      }
    })

    it('refuses a non-canonical field element, which encodes the same points', () => {
      // y = p (2^255 - 19) reduces to 0, an order-4 point — a blacklist of the
      // canonical encodings alone would not catch it.
      const nonCanonical = Buffer.alloc(32)
      nonCanonical.writeBigUInt64LE(0xFFFFFFFFFFFFFFEDn, 0)
      nonCanonical.fill(0xFF, 8, 31)
      nonCanonical[31] = 0x7F

      expect(importMasterPublicKey(nonCanonical.toString('base64url'))).toBeNull()
    })

    it('accepts a key derived the way the extension derives it', () => {
      const master = createMasterKeyPair()

      expect(importMasterPublicKey(master.publicKey)).not.toBeNull()
    })

    it('rejects an SPKI-encoded master key, documenting that raw is expected', () => {
      const { publicKey } = generateKeyPairSync('ed25519')
      const spki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url')

      expect(spki).not.toHaveLength(43)
      expect(importMasterPublicKey(spki)).toBeNull()
    })
  })

  describe('device (ecdsa p-256)', () => {
    it('verifies a signature over the spki-91 wire format', () => {
      const device = createDeviceKeyPair()

      expect(device.publicKey).toHaveLength(122)
      expect(verifyDeviceSignature(device.publicKey, MESSAGE, device.sign(MESSAGE))).toBe(true)
    })

    it('rejects an ASN.1 DER signature', () => {
      // WebCrypto emits raw r||s. If either side ever loses `dsaEncoding:
      // ieee-p1363`, node produces ~70 bytes of DER and every request 401s in
      // silence — this is the test that makes that loud.
      const device = createDeviceKeyPair()
      const der = device.signDer(MESSAGE)

      expect(Buffer.from(der, 'base64url').length).toBeGreaterThan(64)
      expect(verifyDeviceSignature(device.publicKey, MESSAGE, der)).toBe(false)
    })

    it('rejects a tampered message, a tampered signature and a foreign key', () => {
      const device = createDeviceKeyPair()
      const other = createDeviceKeyPair()
      const signature = device.sign(MESSAGE)

      expect(verifyDeviceSignature(device.publicKey, Buffer.from('other message'), signature)).toBe(false)
      expect(verifyDeviceSignature(device.publicKey, MESSAGE, other.sign(MESSAGE))).toBe(false)
      expect(verifyDeviceSignature(other.publicKey, MESSAGE, signature)).toBe(false)
    })

    it('rejects keys of the wrong type or curve, without throwing', () => {
      const { publicKey: p384 } = generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
      const p384Spki = p384.export({ format: 'der', type: 'spki' })

      expect(importDevicePublicKey(p384Spki.toString('base64url'))).toBeNull()
      // Right length, wrong bytes: createPublicKey throws, we must return null
      expect(importDevicePublicKey(Buffer.alloc(91, 1).toString('base64url'))).toBeNull()
    })
  })

  it('never lets one tier verify the other tier signatures', () => {
    const master = createMasterKeyPair()
    const device = createDeviceKeyPair()

    expect(verifyDeviceSignature(master.publicKey, MESSAGE, master.sign(MESSAGE))).toBe(false)
    expect(verifyMasterSignature(device.publicKey, MESSAGE, device.sign(MESSAGE))).toBe(false)
  })
})
