import { useEffect, useState } from 'react'
import browser from 'webextension-polyfill'
import { SignIn } from '~components/auth/sign-in/SignIn'
import { SignUp } from '~components/auth/sign-up/SignUp'
import { SaveFavorite } from '~components/favorite/SaveFavorite'
import { SearchFavorite } from '~components/favorite/SearchFavorite'
import { checkPrivateKeyValidity } from '~helpers/check-private-key-validity.helper'
import { Button } from './components/shared/Button'
import { colors, spacing } from './theme'
import './style.css'

const styles: Record<string, React.CSSProperties> = {
  container: {
    minWidth: 260,
    background: colors.bg,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: `${spacing.lg}px ${spacing.xl}px ${spacing.xl}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  body: {
    display: 'flex',
    alignItems: 'stretch',
    gap: spacing.sm,
    padding: `${spacing.lg}px ${spacing.xl}px ${spacing.md}px`,
    borderBottom: `1px solid ${colors.border}`,
  },
}

function IndexPopup(): React.ReactNode {
  const [hasAccount, setHasAccount] = useState<boolean>(false)
  const [hasToGenerateNewKey, setHasToGenerateNewKey] = useState<boolean>(false)
  const [hasKey, setHasKey] = useState<boolean>(false)
  const [privateKey, setPrivateKey] = useState<string>(() => crypto.randomUUID())
  const [hasAcceptTerms, setHasAcceptTerms] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)

  useEffect(() => {
    setErrorMessage(undefined)

    browser.storage.local.get('private_key').then((result) => {
      if (!result.private_key) {
        setHasAccount(false)
        return
      }

      // User has a private key — check if it's valid and log in
      const validityResult = checkPrivateKeyValidity(result.private_key as string)
      if (validityResult.isValid === false) {
        setErrorMessage(validityResult.errorMessage)
        return
      }

      setHasAccount(true)
    })
  }, [hasAcceptTerms, privateKey])

  function resetBrowserLocalStorage(): void {
    browser.storage.local.clear()
    setPrivateKey(undefined)
  }

  /**
   * On boarding
   */
  function handleGenerateKeyClick(): void {
    setHasKey(false)
    setHasToGenerateNewKey(true)
  }
  function handleAccountAlreadyExistsClick(): void {
    setHasToGenerateNewKey(false)
    setHasKey(true)
  }

  return (
    <div style={styles.container}>
      {errorMessage ? (<p>{errorMessage}</p>) : null}
      {hasAccount
        ? (
            <>
              <SaveFavorite setErrorMessage={setErrorMessage} />
              <SearchFavorite />
            </>
          )
        : (
            <>
              <div style={styles.header}>
                <Button onClick={handleGenerateKeyClick}>Generate auth key</Button>
              </div>
              <div style={styles.body}>
                <Button onClick={handleAccountAlreadyExistsClick}>Already have a key?</Button>
              </div>
              {hasToGenerateNewKey && !hasKey ? <SignUp privateKey={privateKey} hasAcceptTerms={hasAcceptTerms} setHasAcceptTerms={setHasAcceptTerms} /> : null}
              {!hasToGenerateNewKey && hasKey ? <SignIn setErrorMessage={setErrorMessage} setHasAccount={setHasAccount} /> : null}
            </>
          )}
    </div>
  )
}

export default IndexPopup
