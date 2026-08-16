import { clearSession } from '~helpers/auth/session-store.helper'
import { getSession, renewSession } from '~helpers/auth/session.helper'
import { API_BASE, ApiError, AuthError, request } from '~helpers/http.helper'

export { API_BASE, ApiError, AuthError, DeviceMissingError, DeviceRejectedError } from '~helpers/http.helper'

/**
 * Send an authenticated request, re-authenticating once if the session is refused.
 *
 * This is the point that realises "the user never has to sign in again": because the
 * signing key lives on this device, an expired or revoked session can be replaced
 * without any user interaction, so a 15-minute TTL costs nothing.
 *
 * "Once" is guaranteed structurally rather than by a counter: the retry calls
 * `request` directly, never this function, so there is no recursion to bound.
 * @param url path relative to API_BASE
 * @param method
 * @param body
 * @return {Promise<TResponse>}
 */
async function authenticatedFetch<TResponse, TBody = undefined>(url: string, method: string, body?: TBody): Promise<TResponse> {
  const session = await getSession()

  try {
    return await request<TResponse, TBody>(`${API_BASE}${url}`, method, session.token, body)
  }
  catch (error) {
    if (!(error instanceof AuthError)) {
      throw error
    }

    // Revoked, or expired earlier than announced
    await clearSession()
    const renewed = await renewSession()

    // A 401 on this replay propagates as AuthError, and a DeviceRejectedError or
    // DeviceMissingError from the renewal propagates too — both are AuthError
    // subclasses, so callers that only check `instanceof AuthError` still work.
    return request<TResponse, TBody>(`${API_BASE}${url}`, method, renewed.token, body)
  }
}

export const api = {
  get: <TResponse>(url: string) => authenticatedFetch<TResponse>(url, 'GET'),
  post: <TResponse, TBody>(url: string, body?: TBody) => authenticatedFetch<TResponse, TBody>(url, 'POST', body),
  put: <TResponse, TBody>(url: string, body?: TBody) => authenticatedFetch<TResponse, TBody>(url, 'PUT', body),
  patch: <TResponse, TBody>(url: string, body?: TBody) => authenticatedFetch<TResponse, TBody>(url, 'PATCH', body),
  delete: <TResponse>(url: string) => authenticatedFetch<TResponse>(url, 'DELETE'),
  AuthError,
  ApiError,
}
