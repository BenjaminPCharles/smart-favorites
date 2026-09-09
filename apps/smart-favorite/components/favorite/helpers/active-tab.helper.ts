import browser from 'webextension-polyfill'

export interface ActiveTab {
  id: number | undefined
  title: string | undefined
  favIconUrl: string | undefined
  url: string
  lastAccessed: number | undefined
}

/**
 * Reads the focused tab, or null when it has no url the extension is allowed to see.
 */
export async function readActiveTab(): Promise<ActiveTab | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true })
  const tab = tabs[0]

  if (!tab?.url) {
    return null
  }

  return {
    id: tab.id,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    url: tab.url,
    lastAccessed: tab.lastAccessed,
  }
}
