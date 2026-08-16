import { useState } from 'react'
import browser from 'webextension-polyfill'
import { Button } from '~components/shared/Button'
import { spacing } from '~theme'

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: `${spacing.lg}px ${spacing.xl}px ${spacing.xl}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
}

/**
 * Every field of a browser tab is optional in the API, and a favorite is
 * meaningless without a url — so `url` is the one the caller guards on.
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
