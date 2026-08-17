import browser from 'webextension-polyfill'

// storage.session, not in-memory (the popup dies on blur) and not storage.local (on
// disk, which is the flaw this redesign removes).

// Watch out: webextension-polyfill@0.12.0 has no entry for storage.session, so this
// is the unwrapped chrome.storage.session. Works on Chrome MV3 and Firefox 115+ but
// isn't polyfilled, so keep it here and re-check on any polyfill bump.

const SESSION_STORAGE_KEY = 'session'

export interface Session {
  token: string
  /** Absolute local time, computed from the server's relative expiresIn. */
  expiresAt: number
}

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

export async function writeSession(session: Session): Promise<void> {
  await browser.storage.session.set({ [SESSION_STORAGE_KEY]: session })
}

export async function clearSession(): Promise<void> {
  await browser.storage.session.remove(SESSION_STORAGE_KEY)
}
