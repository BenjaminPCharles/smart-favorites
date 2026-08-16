import { writeMasterPublicKey } from '~helpers/auth/account-store.helper'
import { authChallenge, authDevice, authInit } from '~helpers/auth/auth-api.helper'
import { clearSession } from '~helpers/auth/session-store.helper'
import { writeDeviceKey } from '~helpers/crypto/device-key-store.helper'
import { generateDeviceKey, getOrCreateDeviceKey } from '~helpers/crypto/device-key.helper'
import { deriveMasterKey } from '~helpers/crypto/master-key.helper'
import { buildAccountCreateMessage, buildDeviceRegisterMessage } from '~helpers/crypto/signed-message.helper'

/**
 * Create an account from a freshly generated recovery phrase.
 *
 * Called only after the user has verified their backup, which is what makes an
 * abandoned onboarding harmless: no account exists server-side until this runs, so
 * there is nothing to orphan. The device key, by contrast, is persisted before any
 * network call.
 * @param mnemonic
 * @return {Promise<string>} the master public key
 */
export async function createAccount(mnemonic: string): Promise<string> {
  const deviceKey = await getOrCreateDeviceKey()
  const master = deriveMasterKey(mnemonic)

  try {
    const signature = master.sign(buildAccountCreateMessage(master.publicKeyB64Url, deviceKey.publicKeyB64Url))
    await authInit({
      masterPublicKey: master.publicKeyB64Url,
      devicePublicKey: deviceKey.publicKeyB64Url,
      signature,
    })

    await writeMasterPublicKey(master.publicKeyB64Url)

    return master.publicKeyB64Url
  }
  finally {
    master.destroy()
  }
}

/**
 * Authorise this browser on an existing account, using the recovery phrase.
 *
 * A fresh device key is always generated rather than reusing a stored one: that
 * sidesteps both the "already registered" ambiguity and the revoked-key case in one
 * stroke. The cost is one dead user_device row per unnecessary restore, which the
 * devices screen exists to clean up.
 *
 * Nothing local is touched until the server has accepted the new key. That ordering
 * is the whole point of this function: writing the key first — or deleting the old
 * one first — means a network blip, a 429 or a full device list leaves the extension
 * holding a key the server never saw, while `master_public_key` is still in
 * storage.local. loadAuthState would then read `device-ready`, the popup would show
 * the normal screen, every call would 401, and this very screen would be
 * unreachable. Persisting last makes a failed restore a no-op the user can retry.
 * @param mnemonic
 * @return {Promise<string>} the master public key
 */
export async function restoreDevice(mnemonic: string): Promise<string> {
  const master = deriveMasterKey(mnemonic)

  try {
    const deviceKey = await generateDeviceKey()
    const { nonce } = await authChallenge({ masterPublicKey: master.publicKeyB64Url })
    const signature = master.sign(
      buildDeviceRegisterMessage(master.publicKeyB64Url, deviceKey.publicKeyB64Url, nonce),
    )

    await authDevice({
      masterPublicKey: master.publicKeyB64Url,
      devicePublicKey: deviceKey.publicKeyB64Url,
      nonce,
      signature,
    })

    // Enrolled, so the new key can replace the old one. A put under the same record
    // key, not a delete then a write: there is no instant where neither key exists.
    await writeDeviceKey(deviceKey)
    // The old session belonged to the key that was just replaced
    await clearSession()
    await writeMasterPublicKey(master.publicKeyB64Url)

    return master.publicKeyB64Url
  }
  finally {
    master.destroy()
  }
}
