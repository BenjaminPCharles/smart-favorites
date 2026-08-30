import { clearMasterPublicKey, writeMasterPublicKey } from '~helpers/auth/account-store.helper'
import { authChallenge, authDevice, authInit } from '~helpers/auth/auth-api.helper'
import { clearSession } from '~helpers/auth/session-store.helper'
import { deleteDeviceKey, writeDeviceKey } from '~helpers/crypto/device-key-store.helper'
import { generateDeviceKey, getOrCreateDeviceKey } from '~helpers/crypto/device-key.helper'
import { deriveMasterKey } from '~helpers/crypto/master-key.helper'
import { buildAccountCreateMessage, buildDeviceRegisterMessage } from '~helpers/crypto/signed-message.helper'

/**
 * Returns the master public key. Only called once the user verified their backup,
 * which is what makes an abandoned onboarding harmless: nothing exists server-side
 * until this runs, so there's nothing to orphan.
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
 * Drops everything this browser knows about the account, which is the only way off
 * the restore screen when the server no longer has the account. Nothing here is
 * irrecoverable: all of it derives from the 12 words. The master key goes last, it's
 * the storage.onChanged key the popup watches, so the refresh it triggers sees a
 * state that's already clean.
 */
export async function forgetAccount(): Promise<void> {
  await deleteDeviceKey()
  await clearSession()
  await clearMasterPublicKey()
}

/**
 * Always a fresh device key, which dodges the "already registered" ambiguity and the
 * revoked-key case at once. Nothing local is touched until the server accepts it:
 * persist first and a 429 leaves us `device-ready` on a key nobody knows.
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

    // Enrolled, so the new key can replace the old one. A put on the same record key
    // rather than a delete then a write, so there's no instant with no key at all.
    await writeDeviceKey(deviceKey)
    // The old session belonged to the key we just replaced
    await clearSession()
    await writeMasterPublicKey(master.publicKeyB64Url)

    return master.publicKeyB64Url
  }
  finally {
    master.destroy()
  }
}
