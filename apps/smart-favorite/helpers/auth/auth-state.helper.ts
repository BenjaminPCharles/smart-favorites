import { api } from '~helpers/api.helper'
import { readMasterPublicKey } from '~helpers/auth/account-store.helper'
import { readDeviceKey } from '~helpers/crypto/device-key-store.helper'
import { AuthError } from '~helpers/http.helper'

export type AuthState
  = | { status: 'no-account' }
    | { status: 'device-ready', devicePublicKey: string }
    | { status: 'device-missing', masterPublicKey: string }

/**
 * Derive what the UI should show from two facts: is there a device key in
 * IndexedDB, and is there a master public key in storage.local.
 *
 * | device key | master key | state          | why                                          |
 * |------------|------------|----------------|----------------------------------------------|
 * | no         | no         | no-account     | fresh install                                |
 * | yes        | yes        | device-ready   | normal                                       |
 * | no         | yes        | device-missing | IndexedDB cleared, or the device was revoked |
 * | yes        | no         | no-account     | onboarding abandoned before /auth/init       |
 *
 * The last row is the abandoned-onboarding case, and it resolves to zero garbage:
 * the orphan device key is reused rather than regenerated, and no account was ever
 * created server-side because /auth/init only runs after the backup check.
 * @return {Promise<AuthState>}
 */
export async function loadAuthState(): Promise<AuthState> {
  const [deviceKey, masterPublicKey] = await Promise.all([readDeviceKey(), readMasterPublicKey()])

  if (!masterPublicKey) {
    return { status: 'no-account' }
  }

  if (!deviceKey) {
    return { status: 'device-missing', masterPublicKey }
  }

  return { status: 'device-ready', devicePublicKey: deviceKey.publicKeyB64Url }
}

/**
 * Load the auth state, then ask the server whether it still agrees.
 *
 * loadAuthState reads local facts only, so it cannot see a device that was revoked
 * server-side — it would keep reporting `device-ready` while every call 401s. One
 * `GET /auth/verify` settles it: the request goes through the normal authenticated
 * path, so an expired session simply renews in silence, and only a genuinely refused
 * key drops through as an AuthError. The session layer has already deleted that key
 * by then, which is why the second read returns `device-missing`.
 *
 * A non-auth failure (backend down, offline) deliberately keeps the local state: the
 * popup has to stay usable when the network is not.
 * @return {Promise<AuthState>}
 */
export async function loadVerifiedAuthState(): Promise<AuthState> {
  const state = await loadAuthState()
  if (state.status !== 'device-ready') {
    return state
  }

  try {
    await api.get('/auth/verify')

    return state
  }
  catch (error) {
    if (!(error instanceof AuthError)) {
      return state
    }

    return loadAuthState()
  }
}
