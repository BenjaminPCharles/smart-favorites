import { clearSession } from '~helpers/auth/session-store.helper'
import { getSession, renewSession } from '~helpers/auth/session.helper'
import { API_BASE, ApiError, AuthError, request } from '~helpers/http.helper'

export { API_BASE, ApiError, AuthError, DeviceMissingError, DeviceRejectedError } from '~helpers/http.helper'

/**
 * `url` is relative to API_BASE. Where "the user never signs in again" happens: the
 * key is on this device, so a dead session is replaced with no interaction. "Once"
 * holds structurally, the retry calls `request` and never this function.
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

    // Revoked, or expired sooner than announced
    await clearSession()
    const renewed = await renewSession()

    // A 401 on this replay propagates as AuthError. So do DeviceRejectedError and
    // DeviceMissingError from the renewal, both being AuthError subclasses, so
    // callers that only check `instanceof AuthError` keep working.
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
