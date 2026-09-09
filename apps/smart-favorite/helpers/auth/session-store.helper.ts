import browser from 'webextension-polyfill'

const SESSION_STORAGE_KEY = 'session'

export interface Session {
  token: string
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
