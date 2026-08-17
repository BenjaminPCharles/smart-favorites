import { useEffect, useState } from 'react'
import { Button } from '~components/shared/Button'
import { Callout } from '~components/shared/Callout'
import { Typography } from '~components/shared/Typography'
import { splitMnemonic } from '~helpers/auth/mnemonic.helper'
import { colors, fontSizes, radius, spacing } from '~theme'

/**
 * Fixed width, not `'•'.repeat(word.length)`: per-word dot counts leak the length
 * pattern and cut real chunks out of the wordlist search space. A CSS blur is worse,
 * the plaintext stays in the DOM.
 */
const MASK = '••••••'

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: `${spacing.md}px ${spacing.xl}px ${spacing.lg}px`,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: spacing.xs,
  },
  cell: {
    display: 'flex',
    alignItems: 'baseline',
    gap: spacing.xs,
    padding: `${spacing.xs}px ${spacing.sm}px`,
    background: colors.bgElevated,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
  },
  word: {
    fontFamily: 'monospace',
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  actions: {
    display: 'flex',
    gap: spacing.sm,
  },
}

interface MnemonicRevealProps {
  mnemonic: string
  onContinue: () => void
}

export function MnemonicReveal({ mnemonic, onContinue }: MnemonicRevealProps): React.ReactNode {
  const [isRevealed, setIsRevealed] = useState<boolean>(false)
  const [hasCopied, setHasCopied] = useState<boolean>(false)
  const [copyErrorMessage, setCopyErrorMessage] = useState<string | undefined>(undefined)
  const words = splitMnemonic(mnemonic)

  // In an effect so the timer dies with the component instead of firing into an
  // unmounted tree
  useEffect(() => {
    if (!hasCopied) {
      return
    }

    const timeout = window.setTimeout(() => setHasCopied(false), 2000)

    return () => window.clearTimeout(timeout)
  }, [hasCopied])

  async function handleCopyClick(): Promise<void> {
    try {
      // Rejects if the clipboard permission is refused or the document isn't focused.
      // Swallow that and the user walks away thinking 12 words they never wrote down
      // are safe in their password manager.
      await navigator.clipboard.writeText(mnemonic)
      setCopyErrorMessage(undefined)
      setHasCopied(true)
    }
    catch {
      setCopyErrorMessage('Your browser refused clipboard access — write the words down instead.')
    }
  }

  return (
    <div style={styles.container}>
      <Typography variant="body">These 12 words are your account.</Typography>
      <Typography variant="helper">
        They are the only way back in. We cannot reset them for you — nobody, including us,
        can recover this account without them.
      </Typography>

      <Callout variant="warning">
        Never share your screen while these words are visible. Anyone who has them owns your favorites.
      </Callout>

      <div style={styles.grid}>
        {words.map((word, index) => (
          <div key={word + String(index)} style={styles.cell}>
            <Typography variant="caption">{index + 1}</Typography>
            <span style={styles.word}>{isRevealed ? word : MASK}</span>
          </div>
        ))}
      </div>

      <div style={styles.actions}>
        {isRevealed
          ? (
              <Button onClick={handleCopyClick}>{hasCopied ? 'Copied' : 'Copy'}</Button>
            )
          : (
              <Button onClick={() => setIsRevealed(true)}>Reveal my words</Button>
            )}
      </div>

      {copyErrorMessage ? <Callout variant="danger">{copyErrorMessage}</Callout> : null}

      {isRevealed
        ? (
            <Typography variant="helper">
              Other apps can read your clipboard — writing the words down on paper is safer.
            </Typography>
          )
        : null}

      {/* You cannot confirm a backup you never looked at */}
      <Button variant="primary" fullWidth disabled={!isRevealed} onClick={onContinue}>
        → I have written them down
      </Button>
    </div>
  )
}
