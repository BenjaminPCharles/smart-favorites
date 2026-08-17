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
 * A 401 here always means the *key* was refused, these routes have no session to
 * expire, so it becomes DeviceRejectedError. That's what sends the user to the
 * recovery screen instead of retrying forever.
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

/** `signature` is over the account-create message. */
export async function authInit(body: { masterPublicKey: string, devicePublicKey: string, signature: string }): Promise<void> {
  await post<{ publicId: string, deviceUuid: string }, typeof body>('/auth/init', body)
}

/** Ask for a single-use nonce, for either a device key or a master key. */
export async function authChallenge(body: { devicePublicKey: string } | { masterPublicKey: string }): Promise<AuthChallengeResponse> {
  const response = await post<AuthChallengeResponse, typeof body>('/auth/challenge', body)

  // Shape check instead of a schema library. The server is the paranoid side here,
  // and zod would be this bundle's only user of zod
  if (typeof response?.nonce !== 'string' || !response.nonce) {
    throw new Error('The server returned an unusable challenge')
  }

  return response
}

/** `nonce` comes from /auth/challenge, `signature` is over the session message. */
export async function authSession(body: { devicePublicKey: string, nonce: string, signature: string }): Promise<AuthSessionResponse> {
  const response = await post<AuthSessionResponse, typeof body>('/auth/session', body)

  if (typeof response?.sessionToken !== 'string' || !Number.isFinite(response.expiresIn) || response.expiresIn <= 0) {
    throw new Error('The server returned an unusable session')
  }

  return response
}

/**
 * Enroll this device on an existing account. The master signature is what
 * authenticates the call, and `signature` is over the device-register message.
 */
export async function authDevice(body: { masterPublicKey: string, devicePublicKey: string, nonce: string, signature: string }): Promise<void> {
  await post<{ deviceUuid: string }, typeof body>('/auth/device', body)
}
