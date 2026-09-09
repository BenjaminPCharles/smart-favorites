import type { Session } from '~helpers/auth/session-store.helper'
import { authChallenge, authSession } from '~helpers/auth/auth-api.helper'
import { clearSession, readSession, writeSession } from '~helpers/auth/session-store.helper'
import { deleteDeviceKey, readDeviceKey } from '~helpers/crypto/device-key-store.helper'
import { signWithDeviceKey } from '~helpers/crypto/device-key.helper'
import { buildSessionMessage } from '~helpers/crypto/signed-message.helper'
import { DeviceMissingError, DeviceRejectedError } from '~helpers/http.helper'

const RENEWAL_SKEW_MS = 30_000

let inFlightRenewal: Promise<Session> | undefined

/**
 * Signs a fresh challenge and stores the session that comes back.
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
 * Drops the device key and session after a revocation, keeping the master public key.
 */
async function forgetDevice(): Promise<void> {
  await deleteDeviceKey()
  await clearSession()
}

/**
 * Opens a new session, concurrent callers sharing one in-flight attempt that stays retryable.
 */
export async function renewSession(): Promise<Session> {
  inFlightRenewal ??= createSession().finally(() => {
    inFlightRenewal = undefined
  })

  return inFlightRenewal
}

/**
 * A usable session, renewing first if the stored one is gone or nearly expired.
 */
export async function getSession(): Promise<Session> {
  const stored = await readSession()
  if (stored && stored.expiresAt - Date.now() > RENEWAL_SKEW_MS) {
    return stored
  }

  return renewSession()
}
