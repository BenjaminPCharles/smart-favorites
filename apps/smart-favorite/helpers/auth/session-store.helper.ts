import browser from 'webextension-polyfill'

/**
 * Where the session token lives: `storage.session`.
 *
 * In-memory only is out — the popup's context is destroyed when it loses focus, so
 * every open would cost a challenge round trip. `storage.local` is out — it is on
 * disk, and putting a bearer token on disk is the flaw this redesign removes.
 * `storage.session` is memory-backed, cleared when the browser session ends, and
 * defaults to TRUSTED_CONTEXTS: right for a 15-minute token, and `storage` is
 * already granted.
 *
 * Sharp edge, verified: webextension-polyfill@0.12.0 has no metadata entry for
 * `storage.session`, so the property falls through to the raw target — this is the
 * unwrapped `chrome.storage.session`. It works (Chrome MV3 and Firefox 115+ both
 * return native promises) and @types/webextension-polyfill types it, but it is not
 * polyfilled. Kept isolated in this file, and to be re-checked on any polyfill bump.
 */

const SESSION_STORAGE_KEY = 'session'

export interface Session {
  token: string
  /** Absolute local time, computed from the server's relative expiresIn. */
  expiresAt: number
}

/**
 * Read the current session, if any.
 * @return {Promise<Session | undefined>}
 */
export async function readSession(): Promise<Session | undefined> {
  const result = await browser.storage.session.get(SESSION_STORAGE_KEY)
  const stored = result[SESSION_STORAGE_KEY]

  if (typeof stored !== 'object' || stored === null) {
    return undefined
  }

  const { token, expiresAt } = stored as Partial<Session>
  if (typeof token !== 'string' || typeof expiresAt !== 'number') {
    return undefined
  }

  return { token, expiresAt }
}

/**
 * Store the current session.
 * @param session
 * @return {Promise<void>}
 */
export async function writeSession(session: Session): Promise<void> {
  await browser.storage.session.set({ [SESSION_STORAGE_KEY]: session })
}

/**
 * Drop the current session.
 * @return {Promise<void>}
 */
export async function clearSession(): Promise<void> {
  await browser.storage.session.remove(SESSION_STORAGE_KEY)
}
