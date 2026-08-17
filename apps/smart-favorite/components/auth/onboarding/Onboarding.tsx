import { useState } from 'react'
import { MnemonicReveal } from '~components/auth/mnemonic-reveal/MnemonicReveal'
import { MnemonicVerify } from '~components/auth/mnemonic-verify/MnemonicVerify'
import { Callout } from '~components/shared/Callout'
import { Typography } from '~components/shared/Typography'
import { createAccount } from '~helpers/auth/onboarding.helper'
import { generateRecoveryMnemonic } from '~helpers/crypto/master-key.helper'
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

type OnboardingStep
  = | { name: 'reveal' }
    | { name: 'verify' }
    | { name: 'creating' }
    | { name: 'done' }
    | { name: 'error', message: string }

interface OnboardingProps {
  onCreated: () => void
}

export function Onboarding({ onCreated }: OnboardingProps): React.ReactNode {
  // Lazy initialiser, generated once. A re-render must not hand the user a different
  // phrase from the one they're writing down
  const [mnemonic] = useState<string>(() => generateRecoveryMnemonic())
  const [step, setStep] = useState<OnboardingStep>({ name: 'reveal' })

  async function handleVerified(): Promise<void> {
    setStep({ name: 'creating' })
    try {
      // Nothing exists server-side until this call, so dropping out of the flow any
      // earlier leaves no orphan account behind
      await createAccount(mnemonic)
      setStep({ name: 'done' })
      onCreated()
    }
    catch (error) {
      setStep({ name: 'error', message: toErrorMessage(error) })
    }
  }

  if (step.name === 'reveal') {
    return <MnemonicReveal mnemonic={mnemonic} onContinue={() => setStep({ name: 'verify' })} />
  }

  if (step.name === 'verify') {
    return (
      <MnemonicVerify
        mnemonic={mnemonic}
        onVerified={handleVerified}
        onShowAgain={() => setStep({ name: 'reveal' })}
      />
    )
  }

  if (step.name === 'error') {
    return (
      <div style={styles.container}>
        <Callout variant="danger">{`Could not create your account: ${step.message}`}</Callout>
        <Typography variant="helper">
          Your words are still valid — reopen this page to try again with them.
        </Typography>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <Typography variant="body">
        {step.name === 'creating' ? 'Creating your account...' : 'Your account is ready.'}
      </Typography>
      {step.name === 'done'
        ? <Typography variant="helper">You can close this tab and use the extension from its icon.</Typography>
        : null}
    </div>
  )
}
