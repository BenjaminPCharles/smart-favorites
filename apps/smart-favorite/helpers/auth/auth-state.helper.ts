import { apiCall } from '~helpers/api.helper'
import { readMasterPublicKey } from '~helpers/auth/account-store.helper'
import { readDeviceKey } from '~helpers/crypto/device-key-store.helper'
import { AuthError } from '~helpers/http.helper'

export type AuthState
  = | { status: 'no-account' }
    | { status: 'device-ready', devicePublicKey: string }
    | { status: 'device-missing', masterPublicKey: string }

/**
 * The screen to show, from the device key in IndexedDB and the master key in storage.local.
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
 * loadAuthState plus one round trip, the only way to see a device revoked server-side.
 */
export async function loadVerifiedAuthState(): Promise<AuthState> {
  const state = await loadAuthState()
  if (state.status !== 'device-ready') {
    return state
  }

  try {
    await apiCall.get('/auth/verify')

    return state
  }
  catch (error) {
    if (!(error instanceof AuthError)) {
      return state
    }

    return loadAuthState()
  }
}
