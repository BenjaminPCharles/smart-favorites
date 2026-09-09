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
  publicKeyB64Url: string
  sign: (message: Uint8Array) => string
  destroy: () => void
}

/**
 * 12 words: 128 bits of CSPRNG entropy plus the BIP39 checksum.
 */
export function generateRecoveryMnemonic(): string {
  return generateMnemonic(wordlist, MNEMONIC_STRENGTH_BITS)
}

/**
 * Derives the master key from a mnemonic, throwing on a bad BIP39 checksum.
 */
export function deriveMasterKey(mnemonic: string): MasterKey {
  const normalized = normalizeMnemonic(mnemonic)

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
     * Clears the only long-lived reference to the scalar, best effort against a heap snapshot.
     */
    destroy(): void {
      privateKey.fill(0)
      isDestroyed = true
    },
  }
}
