import { useState } from 'react'
import { Button } from '~components/shared/Button'
import { Callout } from '~components/shared/Callout'
import { Input } from '~components/shared/Input'
import { Typography } from '~components/shared/Typography'
import { MNEMONIC_WORD_COUNT, splitMnemonic, validateMnemonicInput } from '~helpers/auth/mnemonic.helper'
import { restoreDevice } from '~helpers/auth/onboarding.helper'
import { toErrorMessage } from '~helpers/error.helper'
import { spacing } from '~theme'

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: `${spacing.md}px ${spacing.xl}px ${spacing.lg}px`,
  },
}

interface RestoreDeviceProps {
  /** Present when we already know an account exists on this browser. */
  isKnownAccount: boolean
  onRestored: () => void
}

export function RestoreDevice({ isKnownAccount, onRestored }: RestoreDeviceProps): React.ReactNode {
  const [phrase, setPhrase] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
  const [isRestoring, setIsRestoring] = useState<boolean>(false)

  const wordCount = splitMnemonic(phrase).length

  async function handleRestoreClick(): Promise<void> {
    setErrorMessage(undefined)

    // Checked locally first, so a typo never needs a round trip — and the BIP39
    // checksum can tell a misspelling from a genuinely wrong phrase
    const validity = validateMnemonicInput(phrase)
    if (!validity.isValid) {
      setErrorMessage(validity.errorMessage)
      return
    }

    setIsRestoring(true)
    try {
      await restoreDevice(validity.mnemonic)
      setPhrase('')
      onRestored()
    }
    catch (error) {
      setErrorMessage(`Could not authorise this browser: ${toErrorMessage(error)}`)
    }
    finally {
      setIsRestoring(false)
    }
  }

  return (
    <div style={styles.container}>
      <Typography variant="body">
        {isKnownAccount ? 'Authorise this browser again' : 'Restore your account'}
      </Typography>
      <Typography variant="helper">
        {isKnownAccount
          ? 'This browser is no longer authorised. Enter your 12 recovery words to authorise it again.'
          : 'Enter the 12 recovery words you saved when you created your account.'}
      </Typography>

      <Input
        value={phrase}
        onChange={setPhrase}
        placeholder="word one word two word three..."
        ariaLabel="Recovery phrase"
        isInvalid={errorMessage !== undefined}
        disabled={isRestoring}
        multiline
        rows={4}
        autoFocus
      />
      <Typography variant="caption">{`${wordCount} / ${MNEMONIC_WORD_COUNT} words`}</Typography>

      {errorMessage ? <Callout variant="danger">{errorMessage}</Callout> : null}

      <Button
        variant="primary"
        fullWidth
        disabled={isRestoring || wordCount !== MNEMONIC_WORD_COUNT}
        onClick={handleRestoreClick}
      >
        {isRestoring ? 'Authorising...' : '→ Authorise this browser'}
      </Button>
    </div>
  )
}
