import { useState } from 'react'
import { Button } from '~components/shared/Button'
import { Callout } from '~components/shared/Callout'
import { Input } from '~components/shared/Input'
import { Typography } from '~components/shared/Typography'
import { MNEMONIC_WORD_COUNT, splitMnemonic, validateMnemonicInput } from '~helpers/auth/mnemonic.helper'
import { forgetAccount, restoreDevice } from '~helpers/auth/onboarding.helper'
import { toErrorMessage } from '~helpers/error.helper'
import { DeviceRejectedError } from '~helpers/http.helper'
import { spacing } from '~theme'

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: `${spacing.md}px ${spacing.xl}px ${spacing.lg}px`,
  },
  confirmActions: {
    display: 'flex',
    gap: spacing.sm,
  },
}

interface RestoreDeviceProps {
  isKnownAccount: boolean
  onRestored: () => void
  onDismissed: () => void
}

export function RestoreDevice({ isKnownAccount, onRestored, onDismissed }: RestoreDeviceProps): React.ReactNode {
  const [phrase, setPhrase] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
  const [isRestoring, setIsRestoring] = useState<boolean>(false)
  const [isConfirmingForget, setIsConfirmingForget] = useState<boolean>(false)
  const [isForgetting, setIsForgetting] = useState<boolean>(false)

  const wordCount = splitMnemonic(phrase).length

  async function handleRestoreClick(): Promise<void> {
    setErrorMessage(undefined)

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
      setErrorMessage(error instanceof DeviceRejectedError
        ? 'No account on this server matches these 12 words.'
        : `Could not authorise this browser: ${toErrorMessage(error)}`)
    }
    finally {
      setIsRestoring(false)
    }
  }

  async function handleForgetClick(): Promise<void> {
    setErrorMessage(undefined)
    setIsForgetting(true)
    try {
      await forgetAccount()
      onDismissed()
    }
    catch (error) {
      setIsConfirmingForget(false)
      setErrorMessage(`Could not clear this browser: ${toErrorMessage(error)}`)
    }
    finally {
      setIsForgetting(false)
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
        disabled={isRestoring || isConfirmingForget}
        multiline
        rows={4}
        autoFocus
      />
      <Typography variant="caption">{`${wordCount} / ${MNEMONIC_WORD_COUNT} words`}</Typography>

      {errorMessage ? <Callout variant="danger">{errorMessage}</Callout> : null}

      <Button
        variant="primary"
        fullWidth
        disabled={isRestoring || isConfirmingForget || wordCount !== MNEMONIC_WORD_COUNT}
        onClick={handleRestoreClick}
      >
        {isRestoring ? 'Authorising...' : '→ Authorise this browser'}
      </Button>

      {isConfirmingForget
        ? (
            <>
              <Callout variant="warning">
                Forget the account stored on this browser? You'll need your 12 words to come
                back to it.
              </Callout>
              <div style={styles.confirmActions}>
                <Button fullWidth disabled={isForgetting} onClick={handleForgetClick}>
                  {isForgetting ? 'Clearing...' : 'Forget it'}
                </Button>
                <Button fullWidth disabled={isForgetting} onClick={() => setIsConfirmingForget(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )
        : (
            <Button
              disabled={isRestoring}
              onClick={isKnownAccount ? () => setIsConfirmingForget(true) : onDismissed}
            >
              {isKnownAccount ? 'Use a different account' : '← Back'}
            </Button>
          )}
    </div>
  )
}
