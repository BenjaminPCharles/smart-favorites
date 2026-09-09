import { validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'

export const MNEMONIC_WORD_COUNT = 12
export const BACKUP_CHECK_WORD_COUNT = 3

const WORDLIST = new Set(wordlist)

/**
 * Normalizes a phrase to NFKD, lowercase and single spaces, as BIP39 requires.
 */
export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.normalize('NFKD').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
}

export function splitMnemonic(mnemonic: string): string[] {
  const normalized = normalizeMnemonic(mnemonic)

  return normalized ? normalized.split(' ') : []
}

/**
 * Validates a typed phrase, telling a typo, an unknown word and a bad checksum apart.
 */
export function validateMnemonicInput(input: string): { isValid: true, mnemonic: string } | { isValid: false, errorMessage: string } {
  const words = splitMnemonic(input)

  if (words.length !== MNEMONIC_WORD_COUNT) {
    return { isValid: false, errorMessage: `Enter all ${MNEMONIC_WORD_COUNT} recovery words — you entered ${words.length}.` }
  }

  const unknown = words.find(word => !WORDLIST.has(word))
  if (unknown) {
    return { isValid: false, errorMessage: `"${unknown}" is not a recovery word — check the spelling.` }
  }

  const mnemonic = normalizeMnemonic(input)
  if (!validateMnemonic(mnemonic, wordlist)) {
    return { isValid: false, errorMessage: 'Checksum failed: one word is wrong, or two are out of order.' }
  }

  return { isValid: true, mnemonic }
}

/**
 * Distinct ascending positions the user retypes to prove they wrote the phrase down.
 */
export function pickBackupCheckIndices(): number[] {
  const indices = new Set<number>()

  while (indices.size < BACKUP_CHECK_WORD_COUNT) {
    const draw = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
    indices.add(draw % MNEMONIC_WORD_COUNT)
  }

  return [...indices].sort((left, right) => left - right)
}

/**
 * Checks the retyped words and returns which positions are wrong, for the UI to mark.
 */
export function verifyBackupWords(mnemonic: string, indices: number[], answers: string[]): { isValid: true } | { isValid: false, invalidIndices: number[] } {
  const words = splitMnemonic(mnemonic)
  const invalidIndices = indices.filter((wordIndex, position) => {
    return words[wordIndex] !== normalizeMnemonic(answers[position] ?? '')
  })

  return invalidIndices.length === 0 ? { isValid: true } : { isValid: false, invalidIndices }
}
