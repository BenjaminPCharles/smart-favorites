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

interface SaveFavoriteProps {
  setErrorMessage: (message: string | undefined) => void
}
export function SaveFavorite({ setErrorMessage }: SaveFavoriteProps): React.ReactNode {
  const [_data, setData] = useState<{ title: string, favIconUrl: string, url: string, lastAccessed: number }>(undefined)

  async function handleSaveFavoriteClick(): Promise<void> {
    try {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (!tabs[0]) {
        return
      }
      const { title, url, favIconUrl, lastAccessed } = tabs[0]
      setData({ title, url, favIconUrl, lastAccessed })
    }
    catch (error) {
      setErrorMessage(`Extension cannot access your browser: ${error.message}`)
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
