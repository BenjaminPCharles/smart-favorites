import browser from 'webextension-polyfill'

export const MASTER_PUBLIC_KEY_STORAGE_KEY = 'master_public_key'

export async function readMasterPublicKey(): Promise<string | undefined> {
  const result = await browser.storage.local.get(MASTER_PUBLIC_KEY_STORAGE_KEY)
  const stored = result[MASTER_PUBLIC_KEY_STORAGE_KEY]

  return typeof stored === 'string' && stored ? stored : undefined
}

export async function writeMasterPublicKey(masterPublicKey: string): Promise<void> {
  await browser.storage.local.set({ [MASTER_PUBLIC_KEY_STORAGE_KEY]: masterPublicKey })
}

/**
 * Sends the popup back to the welcome screen, see forgetAccount.
 */
export async function clearMasterPublicKey(): Promise<void> {
  await browser.storage.local.remove(MASTER_PUBLIC_KEY_STORAGE_KEY)
}
