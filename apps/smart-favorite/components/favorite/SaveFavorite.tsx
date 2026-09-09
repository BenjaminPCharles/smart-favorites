import type { ActiveTab } from './helpers/active-tab.helper'
import type { FavoriteStatus } from './helpers/favorite-status.helper'
import { useEffect, useState } from 'react'
import { Button } from '~components/shared/Button'
import { apiCall, ApiError } from '~helpers/api.helper'
import { toErrorMessage } from '~helpers/error.helper'
import { spacing } from '~theme'
import { readPageContent } from './helpers/extract-page-content.helper'
import { readFavoriteStatus } from './helpers/favorite-status.helper'

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: `${spacing.lg}px ${spacing.xl}px ${spacing.xl}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
}

type SaveStatus = 'checking' | 'savable' | 'saving' | 'saved' | 'already-saved' | 'unsavable'

const labels: Record<SaveStatus, string> = {
  'checking': 'Checking...',
  'savable': 'Save favorite',
  'saving': 'Saving...',
  'saved': 'Saved to favorites',
  'already-saved': 'Already in favorites',
  'unsavable': 'This page cannot be saved',
}

/**
 * The status a freshly opened popup shows, before the user clicks anything.
 */
export function statusForFavorite({ tab, isSaved }: FavoriteStatus): SaveStatus {
  if (!tab) {
    return 'unsavable'
  }

  return isSaved ? 'already-saved' : 'savable'
}

interface SaveFavoriteProps {
  setErrorMessage: (message: string | undefined) => void
}
export function SaveFavorite({ setErrorMessage }: SaveFavoriteProps): React.ReactNode {
  const [status, setStatus] = useState<SaveStatus>('checking')
  const [tab, setTab] = useState<ActiveTab | null>(null)

  useEffect(() => {
    let isCancelled = false

    readFavoriteStatus()
      .then((favorite) => {
        if (!isCancelled) {
          setTab(favorite.tab)
          setStatus(statusForFavorite(favorite))
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setStatus('unsavable')
          setErrorMessage(toErrorMessage(error))
        }
      })

    return () => {
      isCancelled = true
    }
  }, [])

  async function handleSaveFavoriteClick(): Promise<void> {
    if (status !== 'savable' || !tab) {
      return
    }

    setStatus('saving')
    setErrorMessage(undefined)

    try {
      const content = await readPageContent(tab.id)
      const { title, url, favIconUrl, lastAccessed } = tab
      await apiCall.post('/favorites', { title: title || url, url, favIconUrl, lastAccessed, content })
      setStatus('saved')
    }
    catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setStatus('already-saved')
        return
      }

      setStatus('savable')
      setErrorMessage(toErrorMessage(error))
    }
  }

  return (
    <div style={styles.container}>
      <Button onClick={handleSaveFavoriteClick} disabled={status !== 'savable'}>
        <span>★</span>
        {labels[status]}
      </Button>
    </div>
  )
}
