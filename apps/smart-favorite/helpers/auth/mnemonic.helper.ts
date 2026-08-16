import { validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'

export const MNEMONIC_WORD_COUNT = 12
export const BACKUP_CHECK_WORD_COUNT = 3

const WORDLIST = new Set(wordlist)

/**
 * Fold a phrase to the form the derivation expects: NFKD, lowercase, single spaces.
 * BIP39 itself mandates NFKD; the rest is so that a trailing space or an
 * autocapitalised first word is not treated as a wrong phrase.
 * @param mnemonic
 * @return {string}
 */
export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.normalize('NFKD').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
}

/**
 * Split a phrase into its words.
 * @param mnemonic
 * @return {string[]}
 */
export function splitMnemonic(mnemonic: string): string[] {
  const normalized = normalizeMnemonic(mnemonic)

  return normalized ? normalized.split(' ') : []
}

/**
 * Validate a phrase typed or pasted by the user.
 *
 * Three genuinely distinct messages, which is the concrete win over the old
 * 107-character key: a typo, an unknown word, and a wrong checksum used to be
 * indistinguishable. Unlike check-private-key-validity's single frozen message,
 * being specific here leaks nothing — the phrase is the user's own.
 * @param input
 * @return {{ isValid: true, mnemonic: string } | { isValid: false, errorMessage: string }}
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
 * Draw the positions the user must retype to prove they wrote the phrase down.
 *
 * crypto.getRandomValues rather than Math.random: it is free here, and one rule for
 * everything security-adjacent is easier to keep than two.
 * @return {number[]} distinct positions in [0, MNEMONIC_WORD_COUNT), ascending
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
 * Check the words the user retyped.
 *
 * Returns the positions that are wrong, so the UI can mark those fields — a
 * deliberate divergence from the frozen single-message pattern of
 * check-private-key-validity, whose point was to avoid being an oracle. There is no
 * oracle here: the verifier already knows the answer and the user has just read it.
 * @param mnemonic
 * @param indices
 * @param answers aligned with `indices`
 * @return {{ isValid: true } | { isValid: false, invalidIndices: number[] }}
 */
export function verifyBackupWords(mnemonic: string, indices: number[], answers: string[]): { isValid: true } | { isValid: false, invalidIndices: number[] } {
  const words = splitMnemonic(mnemonic)
  const invalidIndices = indices.filter((wordIndex, position) => {
    return words[wordIndex] !== normalizeMnemonic(answers[position] ?? '')
  })

  return invalidIndices.length === 0 ? { isValid: true } : { isValid: false, invalidIndices }
}
