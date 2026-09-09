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
 * Posts to a public auth route, turning a refused key into DeviceRejectedError.
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
 * `signature` is over the account-create message.
 */
export async function authInit(body: { masterPublicKey: string, devicePublicKey: string, signature: string }): Promise<void> {
  await post<{ publicId: string, deviceUuid: string }, typeof body>('/auth/init', body)
}

/**
 * Ask for a single-use nonce, for either a device key or a master key.
 */
export async function authChallenge(body: { devicePublicKey: string } | { masterPublicKey: string }): Promise<AuthChallengeResponse> {
  const response = await post<AuthChallengeResponse, typeof body>('/auth/challenge', body)

  if (typeof response?.nonce !== 'string' || !response.nonce) {
    throw new Error('The server returned an unusable challenge')
  }

  return response
}

/**
 * `nonce` comes from /auth/challenge, `signature` is over the session message.
 */
export async function authSession(body: { devicePublicKey: string, nonce: string, signature: string }): Promise<AuthSessionResponse> {
  const response = await post<AuthSessionResponse, typeof body>('/auth/session', body)

  if (typeof response?.sessionToken !== 'string' || !Number.isFinite(response.expiresIn) || response.expiresIn <= 0) {
    throw new Error('The server returned an unusable session')
  }

  return response
}

/**
 * Enrolls this device on an existing account, authenticated by the master signature.
 */
export async function authDevice(body: { masterPublicKey: string, devicePublicKey: string, nonce: string, signature: string }): Promise<void> {
  await post<{ deviceUuid: string }, typeof body>('/auth/device', body)
}
