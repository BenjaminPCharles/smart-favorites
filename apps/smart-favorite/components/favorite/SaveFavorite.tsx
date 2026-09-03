import { useState } from 'react'
import browser from 'webextension-polyfill'
import { Button } from '~components/shared/Button'
import { apiCall } from '~helpers/api.helper'
import { spacing } from '~theme'
import { readPageContent } from './helpers/extract-page-content.helper'

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: `${spacing.lg}px ${spacing.xl}px ${spacing.xl}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
}

/**
 * Every browser tab field is optional in the API, but a favorite without a url is
 * meaningless, so `url` is the one callers guard on.
 */
interface SavedTab {
  title: string | undefined
  favIconUrl: string | undefined
  url: string
  lastAccessed: number | undefined
}

interface SaveFavoriteProps {
  setErrorMessage: (message: string | undefined) => void
}
export function SaveFavorite({ setErrorMessage }: SaveFavoriteProps): React.ReactNode {
  const [_data, setData] = useState<SavedTab | undefined>(undefined)

  async function handleSaveFavoriteClick(): Promise<void> {
    try {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
      const tab = tabs[0]
      if (!tab?.url) {
        return
      }

      const { title, url, favIconUrl, lastAccessed } = tab
      const content = await readPageContent(tab.id)
      // `title` is required server-side, and a tab can have none: the url is the readable fallback
      await apiCall.post('/favorites', { title: title || url, url, favIconUrl, lastAccessed, content })
      setData({ title, url, favIconUrl, lastAccessed })
    }
    catch (error) {
      setErrorMessage(`Extension cannot access your browser: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <div style={styles.container}>
      <Button onClick={handleSaveFavoriteClick}>
        <span>★</span>
        Save favorite
      </Button>
    </div>
  )
}
