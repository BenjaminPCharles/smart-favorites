import { createPublicKey, verify } from 'node:crypto'
import { validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { describe, expect, it } from 'vitest'
import { splitMnemonic } from '~helpers/auth/mnemonic.helper'
import { base64UrlToBytes } from '~helpers/crypto/base64url.helper'
import { deriveMasterKey, generateRecoveryMnemonic } from '~helpers/crypto/master-key.helper'
import { buildAccountCreateMessage } from '~helpers/crypto/signed-message.helper'

/** BIP39 reference phrases, so the golden vector below is reproducible. */
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const OTHER_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

describe('master-key.helper', () => {
  it('generates a valid 12-word phrase', () => {
    const mnemonic = generateRecoveryMnemonic()

    expect(splitMnemonic(mnemonic)).toHaveLength(12)
    expect(validateMnemonic(mnemonic, wordlist)).toBe(true)
    expect(mnemonic).not.toBe(generateRecoveryMnemonic())
  })

  it('derives deterministically, and matches a locked golden vector', () => {
    // This value pins the whole derivation: the BIP39 seed, HKDF-SHA512, the `info`
    // string, and the 32-byte output. If any of them changes, every existing account
    // becomes unreachable with no other symptom — so this assertion failing is the
    // only warning there would ever be.
    const first = deriveMasterKey(TEST_MNEMONIC)
    const second = deriveMasterKey(TEST_MNEMONIC)

    expect(first.publicKeyB64Url).toBe(second.publicKeyB64Url)
    expect(first.publicKeyB64Url).toBe('cFnhn7Lq9wjZBRp9kZvb_0oNjxmsMN504Pve5HQmTyQ')
    expect(first.publicKeyB64Url).toHaveLength(43)
  })

  it('derives a different key from a different phrase', () => {
    expect(deriveMasterKey(TEST_MNEMONIC).publicKeyB64Url)
      .not
      .toBe(deriveMasterKey(OTHER_MNEMONIC).publicKeyB64Url)
  })

  it('refuses a phrase that fails its BIP39 checksum', () => {
    // Two words swapped: 12 words, all in the wordlist, so mnemonicToSeedSync alone
    // would happily derive a wrong-but-plausible key. Only the checksum catches it.
    const swapped = 'legal winner thank year wave sausage worth useful legal winner yellow thank'

    expect(() => deriveMasterKey(swapped)).toThrow('Invalid recovery phrase')
    expect(() => deriveMasterKey(Array.from({ length: 12 }).fill('abandon').join(' '))).toThrow('Invalid recovery phrase')
  })

  it('is insensitive to spacing and capitalisation', () => {
    expect(deriveMasterKey(`  ${TEST_MNEMONIC.toUpperCase()}   `).publicKeyB64Url)
      .toBe(deriveMasterKey(TEST_MNEMONIC).publicKeyB64Url)
  })

  it('produces signatures the server verifies, in the wire format it expects', () => {
    const master = deriveMasterKey(generateRecoveryMnemonic())
    const message = buildAccountCreateMessage(master.publicKeyB64Url, 'device-key')
    const signature = master.sign(message)

    expect(base64UrlToBytes(signature)).toHaveLength(64)

    // Exactly what apps/back/src/helpers/signature.helper.ts does: the base64url
    // public key is used verbatim as the JWK `x`
    const serverKey = createPublicKey({
      format: 'jwk',
      key: { kty: 'OKP', crv: 'Ed25519', x: master.publicKeyB64Url },
    })

    expect(verify(null, message, serverKey, base64UrlToBytes(signature))).toBe(true)
    expect(verify(null, new TextEncoder().encode('other'), serverKey, base64UrlToBytes(signature))).toBe(false)
  })

  it('refuses to sign once destroyed', () => {
    const master = deriveMasterKey(TEST_MNEMONIC)
    master.destroy()

    expect(() => master.sign(new Uint8Array([1]))).toThrow('already been destroyed')
  })
})
