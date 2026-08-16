import { useState } from 'react'
import { Button } from '~components/shared/Button'
import { Callout } from '~components/shared/Callout'
import { Input } from '~components/shared/Input'
import { Typography } from '~components/shared/Typography'
import { BACKUP_CHECK_WORD_COUNT, pickBackupCheckIndices, verifyBackupWords } from '~helpers/auth/mnemonic.helper'
import { spacing } from '~theme'

/** After this many misses, offer the phrase again rather than let them guess. */
const ATTEMPTS_BEFORE_OFFERING_REVEAL = 3

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: `${spacing.md}px ${spacing.xl}px ${spacing.lg}px`,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
}

interface MnemonicVerifyProps {
  mnemonic: string
  onVerified: () => void
  onShowAgain: () => void
}

export function MnemonicVerify({ mnemonic, onVerified, onShowAgain }: MnemonicVerifyProps): React.ReactNode {
  // A lazy initialiser, so a re-render never reshuffles the question mid-answer
  const [indices] = useState<number[]>(() => pickBackupCheckIndices())
  const [answers, setAnswers] = useState<string[]>(() => Array.from({ length: BACKUP_CHECK_WORD_COUNT }).fill('') as string[])
  const [invalidIndices, setInvalidIndices] = useState<number[]>([])
  const [attempts, setAttempts] = useState<number>(0)

  function handleAnswerChange(position: number, value: string): void {
    setAnswers(current => current.map((answer, index) => (index === position ? value : answer)))
    setInvalidIndices([])
  }

  function handleVerifyClick(): void {
    const result = verifyBackupWords(mnemonic, indices, answers)
    if (result.isValid) {
      onVerified()
      return
    }

    setInvalidIndices(result.invalidIndices)
    setAttempts(current => current + 1)
  }

  const isComplete = answers.every(answer => answer.trim().length > 0)

  return (
    <div style={styles.container}>
      <Typography variant="body">Confirm your backup.</Typography>
      <Typography variant="helper">
        Type these three words from the phrase you just wrote down.
      </Typography>

      {indices.map((wordIndex, position) => (
        <div key={wordIndex} style={styles.field}>
          <Typography variant="caption">{`Word ${wordIndex + 1}`}</Typography>
          <Input
            value={answers[position] ?? ''}
            onChange={value => handleAnswerChange(position, value)}
            ariaLabel={`Word ${wordIndex + 1}`}
            isInvalid={invalidIndices.includes(wordIndex)}
            autoFocus={position === 0}
          />
        </div>
      ))}

      {invalidIndices.length > 0
        ? (
            <Callout variant="danger">
              {invalidIndices.length === 1
                ? `Word ${invalidIndices[0] === undefined ? '' : invalidIndices[0] + 1} does not match.`
                : `${invalidIndices.length} of these words do not match.`}
            </Callout>
          )
        : null}

      <Button variant="primary" fullWidth disabled={!isComplete} onClick={handleVerifyClick}>
        → Create my account
      </Button>

      {/* Unlimited retries: this is a typing test, not a security boundary — locking
          someone out here would only destroy an account that does not exist yet */}
      {attempts >= ATTEMPTS_BEFORE_OFFERING_REVEAL
        ? <Button onClick={onShowAgain}>Show my words again</Button>
        : null}
    </div>
  )
}
