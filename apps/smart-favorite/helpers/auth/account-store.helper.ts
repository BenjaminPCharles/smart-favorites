import browser from 'webextension-polyfill'

/**
 * The master public key is stored purely as a convenience — it is derivable from
 * the 12 words, so the recovery flow never needs it. Losing it costs the user one
 * extra click, never an account. That is why the welcome screen always offers both
 * "create" and "I have a recovery phrase", and why there is no ordering window to
 * reason about around /auth/init.
 *
 * Nothing secret is ever written here.
 */
export const MASTER_PUBLIC_KEY_STORAGE_KEY = 'master_public_key'

/**
 * Read the stored master public key.
 * @return {Promise<string | undefined>}
 */
export async function readMasterPublicKey(): Promise<string | undefined> {
  const result = await browser.storage.local.get(MASTER_PUBLIC_KEY_STORAGE_KEY)
  const stored = result[MASTER_PUBLIC_KEY_STORAGE_KEY]

  return typeof stored === 'string' && stored ? stored : undefined
}

/**
 * Store the master public key.
 * @param masterPublicKey
 * @return {Promise<void>}
 */
export async function writeMasterPublicKey(masterPublicKey: string): Promise<void> {
  await browser.storage.local.set({ [MASTER_PUBLIC_KEY_STORAGE_KEY]: masterPublicKey })
}
