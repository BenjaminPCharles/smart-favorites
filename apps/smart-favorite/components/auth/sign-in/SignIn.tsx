import { useState } from 'react'
import { Button } from '~components/shared/Button'
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

  function handleLogin(e: React.ChangeEvent<HTMLInputElement>): void {
    setPrivateKey(e.target.value)
  }

  function handleSignInClick(): void {
    const validityResult = checkPrivateKeyValidity(privateKey)
    if (validityResult.isValid === false) {
      setErrorMessage(validityResult.errorMessage)
      return
    }
    // TODO: call backend to verify the key exists
    // TODO: if valid, save to storage: browser.storage.local.set({ private_key: privateKey })
    // TODO: if invalid, call setErrorMessage with the backend error
    setHasAccount(true)
  }

  return (
    <div style={styles.container}>
      <input style={styles.searchField} type="text" placeholder="Paste your key here" onChange={handleLogin} />
      <Button variant="primary" fullWidth onClick={handleSignInClick}>→ Sign in</Button>
    </div>
  )
}
