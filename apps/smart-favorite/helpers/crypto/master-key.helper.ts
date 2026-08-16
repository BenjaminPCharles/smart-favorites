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
  /** Ed25519, 32 raw bytes, base64url — exactly the JWK `x` the server imports. */
  publicKeyB64Url: string
  sign: (message: Uint8Array) => string
  destroy: () => void
}

/**
 * Draw a fresh 12-word recovery phrase: 128 bits of CSPRNG entropy, plus the BIP39
 * checksum that lets a typo be told apart from a wrong phrase.
 * @return {string}
 */
export function generateRecoveryMnemonic(): string {
  return generateMnemonic(wordlist, MNEMONIC_STRENGTH_BITS)
}

/**
 * Derive the Ed25519 master key from a recovery phrase.
 *
 * `mnemonicToSeedSync` and not `mnemonicToEntropy`: the 64-byte seed is *the* BIP39
 * output, so the derivation describes in one sentence; its 2048 PBKDF2 rounds cost
 * an adversary who recovered part of a phrase real work, where entropy-as-IKM would
 * make HKDF a single trivially parallel hash; and the seed carries BIP39's
 * passphrase slot, so an optional 13th word can be added later without changing this.
 *
 * No HKDF salt: the derivation must be reproducible from the 12 words alone, on any
 * device. RFC 5869 then uses a zero-filled salt, which is fine — the IKM is already
 * uniform.
 *
 * The private scalar never leaves this closure. Call `destroy()` in a `finally`.
 * @param mnemonic
 * @return {MasterKey}
 * @throws {Error} when the phrase fails its BIP39 checksum
 */
export function deriveMasterKey(mnemonic: string): MasterKey {
  const normalized = normalizeMnemonic(mnemonic)

  // mnemonicToSeedSync only checks the word count and that every word is in the
  // list — it does *not* verify the checksum. Without this guard a single mistyped
  // word would derive a different, valid-looking key and silently point at an
  // account that does not exist. validateMnemonicInput gives the user a readable
  // message; this is the backstop that makes the order impossible to get wrong.
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
     * Zero the scalar. This genuinely clears the only long-lived reference — after
     * it, a heap snapshot holds no master key.
     *
     * What it cannot do, and what docs/AUTH.md states rather than glosses over: the
     * mnemonic is an immutable JS string, alive until GC and possibly interned;
     * @noble/hashes allocates intermediate PBKDF2/HMAC blocks we have no handle on;
     * V8 may have relocated this array during a GC pass; and if the user pressed
     * copy, the phrase is in the OS clipboard. The bar rises a lot; it is not a
     * guarantee. The page being torn down is a far more effective erasure than
     * anything we can write.
     */
    destroy(): void {
      privateKey.fill(0)
      isDestroyed = true
    },
  }
}
