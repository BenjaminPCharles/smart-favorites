import type { Session } from '~helpers/auth/session-store.helper'
import { authChallenge, authSession } from '~helpers/auth/auth-api.helper'
import { clearSession, readSession, writeSession } from '~helpers/auth/session-store.helper'
import { deleteDeviceKey, readDeviceKey } from '~helpers/crypto/device-key-store.helper'
import { signWithDeviceKey } from '~helpers/crypto/device-key.helper'
import { buildSessionMessage } from '~helpers/crypto/signed-message.helper'
import { DeviceMissingError, DeviceRejectedError } from '~helpers/http.helper'

/** Renew a little early, so the common path never wastes a 401. */
const RENEWAL_SKEW_MS = 30_000

let inFlightRenewal: Promise<Session> | undefined

/**
 * Sign a fresh challenge and store the resulting session.
 * @return {Promise<Session>}
 */
async function createSession(): Promise<Session> {
  const deviceKey = await readDeviceKey()
  if (!deviceKey) {
    throw new DeviceMissingError()
  }

  try {
    const { nonce } = await authChallenge({ devicePublicKey: deviceKey.publicKeyB64Url })
    const signature = await signWithDeviceKey(
      deviceKey.privateKey,
      buildSessionMessage(deviceKey.publicKeyB64Url, nonce),
    )
    const { sessionToken, expiresIn } = await authSession({
      devicePublicKey: deviceKey.publicKeyB64Url,
      nonce,
      signature,
    })

    // Relative expiry, so a skewed local clock cannot make a live session look dead
    const session: Session = { token: sessionToken, expiresAt: Date.now() + expiresIn * 1000 }
    await writeSession(session)

    return session
  }
  catch (error) {
    if (error instanceof DeviceRejectedError) {
      await forgetDevice()
    }

    throw error
  }
}

/**
 * Drop the local key the server has just refused.
 *
 * This is what closes the loop between server-side revocation and the UI. The stored
 * auth state is derived from local facts only, so without this the extension keeps
 * reading `device-ready` for a key that is dead server-side: every call 401s, the
 * restore screen is never reached, and the user has no way out short of clearing the
 * extension's storage. Deleting the key makes the next loadAuthState return
 * `device-missing`, which is exactly the state that offers re-authorisation.
 *
 * Deliberately not clearing `master_public_key`: it is not secret, it is derivable
 * from the 12 words anyway, and keeping it is what lets the restore screen say
 * "authorise this browser again" instead of "restore your account".
 * @return {Promise<void>}
 */
async function forgetDevice(): Promise<void> {
  await deleteDeviceKey()
  await clearSession()
}

/**
 * Re-authenticate this device.
 *
 * Concurrent callers share one in-flight attempt, so five simultaneous requests
 * cause one challenge/session pair rather than five. The `.finally` that clears the
 * handle is what makes a *failed* renewal retryable — without it, one network blip
 * would poison every later call for the lifetime of this context.
 *
 * Cross-context stampedes (popup and onboarding tab renewing at once) are
 * deliberately not guarded: /auth/challenge is cheap, the server allows several
 * live sessions per device, and last-writer-wins leaves a valid token either way.
 * @return {Promise<Session>}
 */
export async function renewSession(): Promise<Session> {
  inFlightRenewal ??= createSession().finally(() => {
    inFlightRenewal = undefined
  })

  return inFlightRenewal
}

/**
 * Return a usable session token, renewing first if it is gone or about to expire.
 * @return {Promise<Session>}
 */
export async function getSession(): Promise<Session> {
  const stored = await readSession()
  if (stored && stored.expiresAt - Date.now() > RENEWAL_SKEW_MS) {
    return stored
  }

  return renewSession()
}
