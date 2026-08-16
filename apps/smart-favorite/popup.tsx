import type { Storage } from 'webextension-polyfill'
import type { AuthState } from '~helpers/auth/auth-state.helper'
import { useCallback, useEffect, useState } from 'react'
import browser from 'webextension-polyfill'
import { RestoreDevice } from '~components/auth/restore-device/RestoreDevice'
import { Welcome } from '~components/auth/welcome/Welcome'
import { SaveFavorite } from '~components/favorite/SaveFavorite'
import { SearchFavorite } from '~components/favorite/SearchFavorite'
import { Callout } from '~components/shared/Callout'
import { Typography } from '~components/shared/Typography'
import { MASTER_PUBLIC_KEY_STORAGE_KEY } from '~helpers/auth/account-store.helper'
import { loadVerifiedAuthState } from '~helpers/auth/auth-state.helper'
import { toErrorMessage } from '~helpers/error.helper'
import { colors, spacing } from '~theme'

const styles: Record<string, React.CSSProperties> = {
  container: {
    minWidth: 260,
    background: colors.bg,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  message: {
    padding: `${spacing.md}px ${spacing.xl}px`,
  },
}

type PopupView
  = | { name: 'loading' }
    | { name: 'welcome' }
    | { name: 'restore', isKnownAccount: boolean }
    | { name: 'ready' }
    | { name: 'error', message: string }

/**
 * Map the persisted auth state to a screen. Pure, so it is testable without React.
 * @param state
 * @return {PopupView}
 */
export function viewForAuthState(state: AuthState): PopupView {
  switch (state.status) {
    case 'device-ready':
      return { name: 'ready' }
    case 'device-missing':
      return { name: 'restore', isKnownAccount: true }
    case 'no-account':
      return { name: 'welcome' }
  }
}

function IndexPopup(): React.ReactNode {
  const [view, setView] = useState<PopupView>({ name: 'loading' })
  // Kept apart from `view` on purpose: a failed save is not a broken popup. Replacing
  // the whole screen with an error page left the user with no way back except closing
  // and reopening the popup.
  const [actionErrorMessage, setActionErrorMessage] = useState<string | undefined>(undefined)
  // An explicit invalidation token, rather than a dependency on some incidental
  // piece of state. A child that changes storage calls refresh() and the screen
  // advances — which is what makes the "onboarding never closes" bug impossible to
  // reintroduce by adding a state variable and forgetting the dep array.
  const [reloadToken, setReloadToken] = useState<number>(0)

  const refresh = useCallback((): void => {
    setReloadToken(token => token + 1)
  }, [])

  useEffect(() => {
    // The popup unmounts on blur, possibly mid-promise
    let isCancelled = false

    // Verified, not just read: a device revoked server-side is invisible to the local
    // facts, and this is the round trip that turns it into the restore screen
    loadVerifiedAuthState()
      .then((state) => {
        if (!isCancelled) {
          setView(viewForAuthState(state))
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setView({ name: 'error', message: toErrorMessage(error) })
        }
      })

    return () => {
      isCancelled = true
    }
  }, [reloadToken])

  useEffect(() => {
    // Onboarding finishes in another context (tabs/onboarding), so pick the account
    // up without needing the popup to be reopened
    function handleStorageChanged(changes: Record<string, Storage.StorageChange>, areaName: string): void {
      if (areaName === 'local' && MASTER_PUBLIC_KEY_STORAGE_KEY in changes) {
        refresh()
      }
    }

    browser.storage.onChanged.addListener(handleStorageChanged)

    return () => {
      browser.storage.onChanged.removeListener(handleStorageChanged)
    }
  }, [refresh])

  function handleCreateAccountClick(): void {
    // A tab, not the popup: see tabs/onboarding.tsx for why
    void browser.tabs.create({ url: browser.runtime.getURL('tabs/onboarding.html') })
    window.close()
  }

  if (view.name === 'loading') {
    return (
      <div style={styles.container}>
        <div style={styles.message}>
          <Typography variant="helper">Loading...</Typography>
        </div>
      </div>
    )
  }

  if (view.name === 'error') {
    return (
      <div style={styles.container}>
        <div style={styles.message}>
          <Callout variant="danger">{view.message}</Callout>
        </div>
      </div>
    )
  }

  if (view.name === 'welcome') {
    return (
      <div style={styles.container}>
        <Welcome
          onCreateAccountClick={handleCreateAccountClick}
          onRestoreClick={() => setView({ name: 'restore', isKnownAccount: false })}
        />
      </div>
    )
  }

  if (view.name === 'restore') {
    return (
      <div style={styles.container}>
        <RestoreDevice isKnownAccount={view.isKnownAccount} onRestored={refresh} />
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {actionErrorMessage
        ? (
            <div style={styles.message}>
              <Callout variant="danger">{actionErrorMessage}</Callout>
            </div>
          )
        : null}
      <SaveFavorite setErrorMessage={setActionErrorMessage} />
      <SearchFavorite />
    </div>
  )
}

export default IndexPopup
