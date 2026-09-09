import type { ActiveTab } from './active-tab.helper'
import { apiCall } from '~helpers/api.helper'
import { readActiveTab } from './active-tab.helper'

export interface FavoriteStatus {
  tab: ActiveTab | null
  isSaved: boolean
}

/**
 * Reads the focused tab and whether its url is already among the user's favorites.
 */
export async function readFavoriteStatus(): Promise<FavoriteStatus> {
  const tab = await readActiveTab()

  if (!tab) {
    return { tab: null, isSaved: false }
  }

  return { tab, isSaved: await isUrlSaved(tab.url) }
}

/**
 * Asks the server whether this url is saved, resolving false when the call fails.
 */
async function isUrlSaved(url: string): Promise<boolean> {
  try {
    const { exists } = await apiCall.post<{ exists: boolean }, { url: string }>('/favorites/lookup', { url })

    return exists
  }
  catch {
    return false
  }
}
