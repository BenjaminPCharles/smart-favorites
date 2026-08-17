import type { StoredDeviceKey } from '~helpers/crypto/device-key-store.helper'
import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, unknown>()

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      session: {
        get: vi.fn(async (key: string) => (storage.has(key) ? { [key]: storage.get(key) } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) {
            storage.set(key, value)
          }
        }),
        remove: vi.fn(async (key: string) => void storage.delete(key)),
      },
    },
  },
}))

vi.mock('~helpers/crypto/device-key-store.helper', () => ({
  readDeviceKey: vi.fn(),
  writeDeviceKey: vi.fn(),
  deleteDeviceKey: vi.fn(),
}))

const { getSession, renewSession } = await import('~helpers/auth/session.helper')
const { writeSession } = await import('~helpers/auth/session-store.helper')
const store = await import('~helpers/crypto/device-key-store.helper')
const { DeviceMissingError, DeviceRejectedError } = await import('~helpers/http.helper')

const SESSION_TTL_SECONDS = 900

/** A real P-256 key, so signWithDeviceKey runs for real instead of being stubbed. */
async function createRealDeviceKey(): Promise<StoredDeviceKey> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
  const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey)

  return {
    privateKey: keyPair.privateKey,
    publicKeyB64Url: Buffer.from(spki).toString('base64url'),
    createdAt: Date.now(),
  }
}

/** Stubs fetch so /auth/challenge and /auth/session always succeed. */
function stubHappyFetch(): ReturnType<typeof vi.fn> {
  let issued = 0
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/auth/challenge')) {
      issued += 1

      return new Response(JSON.stringify({ nonce: `nonce-${issued}`, expiresAt: new Date().toISOString() }), { status: 200 })
    }
    if (url.endsWith('/auth/session')) {
      return new Response(JSON.stringify({ sessionToken: `token-${issued}`, expiresIn: SESSION_TTL_SECONDS }), { status: 200 })
    }

    throw new Error(`unexpected call to ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

describe('session.helper', () => {
  beforeEach(async () => {
    storage.clear()
    vi.mocked(store.readDeviceKey).mockReset()
    vi.mocked(store.deleteDeviceKey).mockReset()
    vi.mocked(store.readDeviceKey).mockResolvedValue(await createRealDeviceKey())
  })

  it('returns a live session without touching the network', async () => {
    const fetchMock = stubHappyFetch()
    await writeSession({ token: 'live', expiresAt: Date.now() + 600_000 })

    expect((await getSession()).token).toBe('live')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renews pre-emptively inside the skew window', async () => {
    const fetchMock = stubHappyFetch()
    // 10 seconds left, inside the 30 second skew
    await writeSession({ token: 'nearly-dead', expiresAt: Date.now() + 10_000 })

    expect((await getSession()).token).toBe('token-1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('collapses a stampede into a single challenge/session pair', async () => {
    const fetchMock = stubHappyFetch()

    const sessions = await Promise.all(Array.from({ length: 5 }, () => getSession()))

    // One challenge + one session, not five of each
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new Set(sessions.map(session => session.token)).size).toBe(1)
  })

  it('lets the next call retry after a failed renewal', async () => {
    // Regression test for the `.finally` clearing inFlightRenewal. Without it one
    // network blip poisons every later call in this context.
    const fetchMock = vi.fn(async () => new Response('', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(renewSession()).rejects.toThrow()

    stubHappyFetch()
    expect((await renewSession()).token).toBe('token-1')
  })

  it('reports a rejected device rather than looping', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })))

    await expect(getSession()).rejects.toBeInstanceOf(DeviceRejectedError)
  })

  it('forgets a refused key, so the UI can offer re-authorisation', async () => {
    // Without this the local state keeps saying `device-ready` for a key that's dead
    // server-side, and the restore screen can't be reached
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })))
    await writeSession({ token: 'stale', expiresAt: Date.now() + 600_000 })

    await expect(renewSession()).rejects.toBeInstanceOf(DeviceRejectedError)

    expect(store.deleteDeviceKey).toHaveBeenCalledTimes(1)
    expect(storage.has('session')).toBe(false)
  })

  it('keeps the device key when the failure is not a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))

    await expect(renewSession()).rejects.toThrow()

    expect(store.deleteDeviceKey).not.toHaveBeenCalled()
  })

  it('reports a missing device key without any network call', async () => {
    const fetchMock = stubHappyFetch()
    vi.mocked(store.readDeviceKey).mockResolvedValue(undefined)

    await expect(getSession()).rejects.toBeInstanceOf(DeviceMissingError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
