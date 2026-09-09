import { clearMasterPublicKey, writeMasterPublicKey } from '~helpers/auth/account-store.helper'
import { authChallenge, authDevice, authInit } from '~helpers/auth/auth-api.helper'
import { clearSession } from '~helpers/auth/session-store.helper'
import { deleteDeviceKey, writeDeviceKey } from '~helpers/crypto/device-key-store.helper'
import { generateDeviceKey, getOrCreateDeviceKey } from '~helpers/crypto/device-key.helper'
import { deriveMasterKey } from '~helpers/crypto/master-key.helper'
import { buildAccountCreateMessage, buildDeviceRegisterMessage } from '~helpers/crypto/signed-message.helper'

/**
 * Creates the account and returns its master public key, once the backup is verified.
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
 * Drops all this browser knows of the account, every part of it derivable from the 12 words.
 */
export async function forgetAccount(): Promise<void> {
  await deleteDeviceKey()
  await clearSession()
  await clearMasterPublicKey()
}

/**
 * Enrolls a fresh device key, touching nothing local until the server has accepted it.
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

    await writeDeviceKey(deviceKey)
    await clearSession()
    await writeMasterPublicKey(master.publicKeyB64Url)

    return master.publicKeyB64Url
  }
  finally {
    master.destroy()
  }
}
