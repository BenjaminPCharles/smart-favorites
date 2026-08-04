import { useState } from 'react'
import browser from 'webextension-polyfill'
import { Button } from '~components/shared/Button'
import { authVerify } from '~helpers/api.helper'
import { checkPrivateKeyValidity } from '~helpers/check-private-key-validity.helper'
import { colors, radius, spacing } from '~theme'

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: `${spacing.sm}px ${spacing.xl}px ${spacing.lg}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  searchField: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '7px 10px',
    background: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.sm,
    fontSize: 12,
    color: colors.textSecondary,
    outline: 'none',
  },
}

interface SignInProps {
  setErrorMessage: (message: string) => void
  setHasAccount: (hasAccount: boolean) => void
}
export function SignIn({ setErrorMessage, setHasAccount }: SignInProps): React.ReactNode {
  const [privateKey, setPrivateKey] = useState<string>('')
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false)

  function handleLogin(e: React.ChangeEvent<HTMLInputElement>): void {
    setPrivateKey(e.target.value)
  }

  async function handleSignInClick(): Promise<void> {
    // Local shape check first, so an obvious typo does not need a round trip
    const validityResult = checkPrivateKeyValidity(privateKey)
    if (validityResult.isValid === false) {
      setErrorMessage(validityResult.errorMessage)
      return
    }

    const key = privateKey.trim()
    setIsSigningIn(true)
    try {
      if (!(await authVerify(key))) {
        setErrorMessage('This key does not match any account')
        return
      }

      await browser.storage.local.set({ private_key: key })
      setHasAccount(true)
    }
    catch (error) {
      setErrorMessage(`Could not reach the server: ${error instanceof Error ? error.message : String(error)}`)
    }
    finally {
      setIsSigningIn(false)
    }
  }

  return (
    <div style={styles.container}>
      <input style={styles.searchField} type="text" placeholder="Paste your key here" onChange={handleLogin} />
      <Button variant="primary" fullWidth onClick={handleSignInClick} disabled={isSigningIn}>
        {isSigningIn ? 'Signing in...' : '→ Sign in'}
      </Button>
    </div>
  )
}
