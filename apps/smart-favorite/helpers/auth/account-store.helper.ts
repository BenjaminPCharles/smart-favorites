import browser from 'webextension-polyfill'

/**
 * Convenience only, nothing secret. It's derivable from the 12 words, so losing it
 * costs one extra click rather than an account. Which is why the welcome screen
 * always offers both buttons and /auth/init has no ordering window.
 */
export const MASTER_PUBLIC_KEY_STORAGE_KEY = 'master_public_key'

export async function readMasterPublicKey(): Promise<string | undefined> {
  const result = await browser.storage.local.get(MASTER_PUBLIC_KEY_STORAGE_KEY)
  const stored = result[MASTER_PUBLIC_KEY_STORAGE_KEY]

  return typeof stored === 'string' && stored ? stored : undefined
}

export async function writeMasterPublicKey(masterPublicKey: string): Promise<void> {
  await browser.storage.local.set({ [MASTER_PUBLIC_KEY_STORAGE_KEY]: masterPublicKey })
}

/** Sends the popup back to the welcome screen, see forgetAccount. */
export async function clearMasterPublicKey(): Promise<void> {
  await browser.storage.local.remove(MASTER_PUBLIC_KEY_STORAGE_KEY)
}
