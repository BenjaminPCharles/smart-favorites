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

vi.mock('~helpers/auth/session-store.helper', () => ({
  readSession: vi.fn(),
  writeSession: vi.fn(),
  clearSession: vi.fn(),
}))

vi.mock('~helpers/auth/auth-api.helper', () => ({
  authInit: vi.fn(),
  authChallenge: vi.fn(),
  authDevice: vi.fn(),
  authSession: vi.fn(),
}))

const { restoreDevice } = await import('~helpers/auth/onboarding.helper')
const { generateRecoveryMnemonic } = await import('~helpers/crypto/master-key.helper')
const store = await import('~helpers/crypto/device-key-store.helper')
const accountStore = await import('~helpers/auth/account-store.helper')
const authApi = await import('~helpers/auth/auth-api.helper')
const { DeviceRejectedError } = await import('~helpers/http.helper')

const MNEMONIC = generateRecoveryMnemonic()

describe('onboarding.helper', () => {
  beforeEach(() => {
    vi.mocked(store.writeDeviceKey).mockReset()
    vi.mocked(store.deleteDeviceKey).mockReset()
    vi.mocked(accountStore.writeMasterPublicKey).mockReset()
    vi.mocked(authApi.authChallenge).mockReset()
    vi.mocked(authApi.authDevice).mockReset()
    vi.mocked(authApi.authChallenge).mockResolvedValue({ nonce: 'nonce', expiresAt: new Date().toISOString() })
  })

  describe('restoreDevice', () => {
    it('persists the new key only once the server has enrolled it', async () => {
      vi.mocked(authApi.authDevice).mockResolvedValue(undefined)

      await restoreDevice(MNEMONIC)

      expect(store.writeDeviceKey).toHaveBeenCalledTimes(1)
      expect(accountStore.writeMasterPublicKey).toHaveBeenCalledTimes(1)
      // A put on the same record key replaces the old one, so there's never a moment
      // with no key at all
      expect(store.deleteDeviceKey).not.toHaveBeenCalled()
    })

    it('leaves the local state untouched when enrolment fails', async () => {
      // Regression test for the bricked extension. Writing the key before the server
      // accepted it made loadAuthState report `device-ready` for a key nobody knew,
      // and the restore screen became unreachable
      vi.mocked(authApi.authDevice).mockRejectedValue(new DeviceRejectedError())

      await expect(restoreDevice(MNEMONIC)).rejects.toBeInstanceOf(DeviceRejectedError)

      expect(store.writeDeviceKey).not.toHaveBeenCalled()
      expect(store.deleteDeviceKey).not.toHaveBeenCalled()
      expect(accountStore.writeMasterPublicKey).not.toHaveBeenCalled()
    })

    it('leaves the local state untouched when the challenge fails', async () => {
      vi.mocked(authApi.authChallenge).mockRejectedValue(new Error('Network down'))

      await expect(restoreDevice(MNEMONIC)).rejects.toThrow('Network down')

      expect(store.writeDeviceKey).not.toHaveBeenCalled()
      expect(accountStore.writeMasterPublicKey).not.toHaveBeenCalled()
    })

    it('rejects a phrase that fails its checksum before touching anything', async () => {
      await expect(restoreDevice('abandon '.repeat(12).trim())).rejects.toThrow('Invalid recovery phrase')

      expect(authApi.authChallenge).not.toHaveBeenCalled()
      expect(store.writeDeviceKey).not.toHaveBeenCalled()
    })
  })
})
