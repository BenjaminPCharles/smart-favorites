import { ed25519 } from '@noble/curves/ed25519'
import { hkdf } from '@noble/hashes/hkdf'
import { sha512 } from '@noble/hashes/sha2'
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { normalizeMnemonic } from '~helpers/auth/mnemonic.helper'
import { bytesToBase64Url } from '~helpers/crypto/base64url.helper'

const MASTER_KEY_INFO = 'smart-favorites:v1:master'
const MASTER_KEY_LENGTH = 32
const MNEMONIC_STRENGTH_BITS = 128

export interface MasterKey {
  /** Ed25519, 32 raw bytes, base64url. This string is the JWK `x` the server imports. */
  publicKeyB64Url: string
  sign: (message: Uint8Array) => string
  destroy: () => void
}

/** 12 words: 128 bits of CSPRNG entropy plus the BIP39 checksum. */
export function generateRecoveryMnemonic(): string {
  return generateMnemonic(wordlist, MNEMONIC_STRENGTH_BITS)
}

/**
 * Throws on a bad BIP39 checksum. The scalar stays in this closure, call destroy()
 * in a finally. mnemonicToSeedSync over mnemonicToEntropy for its 2048 PBKDF2
 * rounds, and no salt because this must work from the 12 words alone.
 */
export function deriveMasterKey(mnemonic: string): MasterKey {
  const normalized = normalizeMnemonic(mnemonic)

  // mnemonicToSeedSync checks the word count and the wordlist but *not* the
  // checksum. Without this, one mistyped word derives a valid-looking key pointing
  // at an account that doesn't exist. Backstop for validateMnemonicInput.
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error('Invalid recovery phrase')
  }

  const seed = mnemonicToSeedSync(normalized)
  const privateKey = hkdf(sha512, seed, undefined, MASTER_KEY_INFO, MASTER_KEY_LENGTH)
  seed.fill(0)

  const publicKeyB64Url = bytesToBase64Url(ed25519.getPublicKey(privateKey))
  let isDestroyed = false

  return {
    publicKeyB64Url,

    sign(message: Uint8Array): string {
      if (isDestroyed) {
        throw new Error('The master key has already been destroyed')
      }

      return bytesToBase64Url(ed25519.sign(message, privateKey))
    },

    /**
     * Clears the only long-lived reference, so a later heap snapshot holds no key.
     * Not a guarantee though: the mnemonic is an immutable string alive until GC,
     * @noble allocates blocks we can't reach, and V8 may have moved this array.
     */
    destroy(): void {
      privateKey.fill(0)
      isDestroyed = true
    },
  }
}
