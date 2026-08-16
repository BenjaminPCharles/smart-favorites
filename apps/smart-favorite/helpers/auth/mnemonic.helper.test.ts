import { describe, expect, it } from 'vitest'
import {
  BACKUP_CHECK_WORD_COUNT,
  MNEMONIC_WORD_COUNT,
  normalizeMnemonic,
  pickBackupCheckIndices,
  splitMnemonic,
  validateMnemonicInput,
  verifyBackupWords,
} from '~helpers/auth/mnemonic.helper'

const VALID = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

describe('mnemonic.helper', () => {
  describe('validateMnemonicInput', () => {
    it('accepts a valid phrase, however it was typed', () => {
      const result = validateMnemonicInput(`  ${VALID.toUpperCase()}\n `)

      expect(result).toEqual({ isValid: true, mnemonic: VALID })
    })

    it('reports the word count when it is wrong', () => {
      expect(validateMnemonicInput('legal winner thank')).toEqual({
        isValid: false,
        errorMessage: 'Enter all 12 recovery words — you entered 3.',
      })
      expect(validateMnemonicInput(`${VALID} extra`)).toMatchObject({ isValid: false })
    })

    it('names the word that is not in the wordlist', () => {
      const result = validateMnemonicInput(VALID.replace('sausage', 'sausages'))

      expect(result).toEqual({
        isValid: false,
        errorMessage: '"sausages" is not a recovery word — check the spelling.',
      })
    })

    it('distinguishes a wrong checksum from a typo — the whole point of BIP39', () => {
      const swapped = 'legal winner thank year wave sausage worth useful legal winner yellow thank'
      const result = validateMnemonicInput(swapped)

      expect(result).toEqual({
        isValid: false,
        errorMessage: 'Checksum failed: one word is wrong, or two are out of order.',
      })
    })
  })

  describe('pickBackupCheckIndices', () => {
    it('always draws 3 distinct, sorted, in-range positions', () => {
      for (let attempt = 0; attempt < 1000; attempt += 1) {
        const indices = pickBackupCheckIndices()

        expect(indices).toHaveLength(BACKUP_CHECK_WORD_COUNT)
        expect(new Set(indices).size).toBe(BACKUP_CHECK_WORD_COUNT)
        expect([...indices].sort((left, right) => left - right)).toEqual(indices)
        expect(indices.every(index => index >= 0 && index < MNEMONIC_WORD_COUNT)).toBe(true)
      }
    })

    it('does not always draw the same positions', () => {
      const draws = new Set(Array.from({ length: 50 }, () => pickBackupCheckIndices().join(',')))

      expect(draws.size).toBeGreaterThan(1)
    })
  })

  describe('verifyBackupWords', () => {
    it('accepts the right words, tolerating case and whitespace', () => {
      const words = splitMnemonic(VALID)
      const indices = [0, 5, 11]
      const answers = indices.map(index => ` ${(words[index] ?? '').toUpperCase()} `)

      expect(verifyBackupWords(VALID, indices, answers)).toEqual({ isValid: true })
    })

    it('reports exactly which positions are wrong', () => {
      const words = splitMnemonic(VALID)
      const indices = [1, 4, 9]

      expect(verifyBackupWords(VALID, indices, [words[1] ?? '', 'wrong', words[9] ?? '']))
        .toEqual({ isValid: false, invalidIndices: [4] })
      expect(verifyBackupWords(VALID, indices, ['', '', '']))
        .toEqual({ isValid: false, invalidIndices: [1, 4, 9] })
    })
  })

  it('normalizes to NFKD lowercase single-spaced', () => {
    expect(normalizeMnemonic('  ABANDON   abandon ')).toBe('abandon abandon')
    expect(splitMnemonic('   ')).toEqual([])
  })
})
