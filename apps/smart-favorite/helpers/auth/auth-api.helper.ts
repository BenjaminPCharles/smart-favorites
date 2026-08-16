import { API_BASE, AuthError, DeviceRejectedError, request } from '~helpers/http.helper'

export interface AuthChallengeResponse {
  nonce: string
  expiresAt: string
}

export interface AuthSessionResponse {
  sessionToken: string
  expiresIn: number
}

/**
 * Call an /auth/* route.
 *
 * A 401 here always means the *key* was refused — these routes have no session to
 * expire — so it is rethrown as DeviceRejectedError. That distinction is what lets
 * the UI send the user to the recovery screen instead of retrying forever.
 * @param path
 * @param body
 * @return {Promise<TResponse>}
 */
async function post<TResponse, TBody>(path: string, body: TBody): Promise<TResponse> {
  try {
    return await request<TResponse, TBody>(`${API_BASE}${path}`, 'POST', undefined, body)
  }
  catch (error) {
    if (error instanceof AuthError) {
      throw new DeviceRejectedError()
    }

    throw error
  }
}

/**
 * Create an account from a master public key and a first device key.
 * @param body
 * @param body.masterPublicKey
 * @param body.devicePublicKey
 * @param body.signature over the account-create message
 * @return {Promise<void>}
 */
export async function authInit(body: { masterPublicKey: string, devicePublicKey: string, signature: string }): Promise<void> {
  await post<{ publicId: string, deviceUuid: string }, typeof body>('/auth/init', body)
}

/**
 * Ask for a single-use nonce, for a device key or a master key.
 * @param body
 * @return {Promise<AuthChallengeResponse>}
 */
export async function authChallenge(body: { devicePublicKey: string } | { masterPublicKey: string }): Promise<AuthChallengeResponse> {
  const response = await post<AuthChallengeResponse, typeof body>('/auth/challenge', body)

  // A shape check rather than a schema library: the server is the side that has to
  // be paranoid, and zod would be this bundle's only consumer of itself
  if (typeof response?.nonce !== 'string' || !response.nonce) {
    throw new Error('The server returned an unusable challenge')
  }

  return response
}

/**
 * Exchange a signed challenge for a session token.
 * @param body
 * @param body.devicePublicKey
 * @param body.nonce as issued by /auth/challenge
 * @param body.signature over the session message
 * @return {Promise<AuthSessionResponse>}
 */
export async function authSession(body: { devicePublicKey: string, nonce: string, signature: string }): Promise<AuthSessionResponse> {
  const response = await post<AuthSessionResponse, typeof body>('/auth/session', body)

  if (typeof response?.sessionToken !== 'string' || !Number.isFinite(response.expiresIn) || response.expiresIn <= 0) {
    throw new Error('The server returned an unusable session')
  }

  return response
}

/**
 * Enroll this device on an existing account, authenticated by the master signature.
 * @param body
 * @param body.masterPublicKey
 * @param body.devicePublicKey
 * @param body.nonce as issued by /auth/challenge
 * @param body.signature over the device-register message
 * @return {Promise<void>}
 */
export async function authDevice(body: { masterPublicKey: string, devicePublicKey: string, nonce: string, signature: string }): Promise<void> {
  await post<{ deviceUuid: string }, typeof body>('/auth/device', body)
}
