import { api } from '~helpers/api.helper'
import { readMasterPublicKey } from '~helpers/auth/account-store.helper'
import { readDeviceKey } from '~helpers/crypto/device-key-store.helper'
import { AuthError } from '~helpers/http.helper'

export type AuthState
  = | { status: 'no-account' }
    | { status: 'device-ready', devicePublicKey: string }
    | { status: 'device-missing', masterPublicKey: string }

/**
 * Two facts decide the screen: a device key in IndexedDB, a master key in
 * storage.local. Device key without master key means onboarding was abandoned before
 * /auth/init, and the orphan key gets reused rather than regenerated.
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
 * loadAuthState can't see a device revoked server-side, so one GET /auth/verify
 * settles it: only a refused key surfaces as AuthError, and the session layer has
 * deleted it by then. A non-auth failure keeps the local state, popup stays usable.
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
