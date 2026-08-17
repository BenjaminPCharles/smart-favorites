import type { StoredDeviceKey } from '~helpers/crypto/device-key-store.helper'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~helpers/crypto/device-key-store.helper', () => ({
  readDeviceKey: vi.fn(),
  writeDeviceKey: vi.fn(),
  deleteDeviceKey: vi.fn(),
}))

vi.mock('~helpers/auth/account-store.helper', () => ({
  MASTER_PUBLIC_KEY_STORAGE_KEY: 'master_public_key',
  readMasterPublicKey: vi.fn(),
  writeMasterPublicKey: vi.fn(),
}))

vi.mock('~helpers/api.helper', () => ({
  api: { get: vi.fn() },
}))

const { loadAuthState, loadVerifiedAuthState } = await import('~helpers/auth/auth-state.helper')
const store = await import('~helpers/crypto/device-key-store.helper')
const accountStore = await import('~helpers/auth/account-store.helper')
const { api } = await import('~helpers/api.helper')
const { ApiError, AuthError } = await import('~helpers/http.helper')

const DEVICE_KEY = { publicKeyB64Url: 'device-key', createdAt: 0 } as StoredDeviceKey

describe('auth-state.helper', () => {
  beforeEach(() => {
    vi.mocked(store.readDeviceKey).mockReset()
    vi.mocked(accountStore.readMasterPublicKey).mockReset()
    vi.mocked(api.get).mockReset()
    vi.mocked(api.get).mockResolvedValue(undefined)
  })

  it('reports no account on a fresh install', async () => {
    vi.mocked(store.readDeviceKey).mockResolvedValue(undefined)
    vi.mocked(accountStore.readMasterPublicKey).mockResolvedValue(undefined)

    expect(await loadAuthState()).toEqual({ status: 'no-account' })
  })

  it('reports a ready device when both facts are present', async () => {
    vi.mocked(store.readDeviceKey).mockResolvedValue(DEVICE_KEY)
    vi.mocked(accountStore.readMasterPublicKey).mockResolvedValue('master-key')

    expect(await loadAuthState()).toEqual({ status: 'device-ready', devicePublicKey: 'device-key' })
  })

  it('reports a missing device when IndexedDB was cleared', async () => {
    vi.mocked(store.readDeviceKey).mockResolvedValue(undefined)
    vi.mocked(accountStore.readMasterPublicKey).mockResolvedValue('master-key')

    expect(await loadAuthState()).toEqual({ status: 'device-missing', masterPublicKey: 'master-key' })
  })

  it('treats an orphan device key as no account, so onboarding reuses it', async () => {
    // Onboarding abandoned before /auth/init. Nothing exists server-side and the key
    // already persisted gets reused rather than replaced
    vi.mocked(store.readDeviceKey).mockResolvedValue(DEVICE_KEY)
    vi.mocked(accountStore.readMasterPublicKey).mockResolvedValue(undefined)

    expect(await loadAuthState()).toEqual({ status: 'no-account' })
  })

  describe('loadVerifiedAuthState', () => {
    it('does not call the server when there is no device to verify', async () => {
      vi.mocked(store.readDeviceKey).mockResolvedValue(undefined)
      vi.mocked(accountStore.readMasterPublicKey).mockResolvedValue('master-key')

      expect(await loadVerifiedAuthState()).toEqual({ status: 'device-missing', masterPublicKey: 'master-key' })
      expect(api.get).not.toHaveBeenCalled()
    })

    it('keeps a ready device when the server agrees', async () => {
      vi.mocked(store.readDeviceKey).mockResolvedValue(DEVICE_KEY)
      vi.mocked(accountStore.readMasterPublicKey).mockResolvedValue('master-key')

      expect(await loadVerifiedAuthState()).toEqual({ status: 'device-ready', devicePublicKey: 'device-key' })
      expect(api.get).toHaveBeenCalledWith('/auth/verify')
    })

    it('falls back to the restore screen when the server refuses the device', async () => {
      // The session layer deletes the refused key before rethrowing, so it's the
      // second read that turns a server-side revocation into a reachable UI state
      vi.mocked(accountStore.readMasterPublicKey).mockResolvedValue('master-key')
      vi.mocked(store.readDeviceKey)
        .mockResolvedValueOnce(DEVICE_KEY)
        .mockResolvedValue(undefined)
      vi.mocked(api.get).mockRejectedValue(new AuthError())

      expect(await loadVerifiedAuthState()).toEqual({ status: 'device-missing', masterPublicKey: 'master-key' })
    })

    it('stays usable offline, where a failure says nothing about the device', async () => {
      vi.mocked(store.readDeviceKey).mockResolvedValue(DEVICE_KEY)
      vi.mocked(accountStore.readMasterPublicKey).mockResolvedValue('master-key')
      vi.mocked(api.get).mockRejectedValue(new ApiError(503, 'Service Unavailable'))

      expect(await loadVerifiedAuthState()).toEqual({ status: 'device-ready', devicePublicKey: 'device-key' })
    })
  })
})
