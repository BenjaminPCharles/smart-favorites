import { clearSession } from '~helpers/auth/session-store.helper'
import { getSession, renewSession } from '~helpers/auth/session.helper'
import { API_BASE, ApiError, AuthError, request } from '~helpers/http.helper'

export { API_BASE, ApiError, AuthError, DeviceMissingError, DeviceRejectedError } from '~helpers/http.helper'

/**
 * Calls the API with the session token, renewing it once and replaying on a 401.
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

    await clearSession()
    const renewed = await renewSession()

    return request<TResponse, TBody>(`${API_BASE}${url}`, method, renewed.token, body)
  }
}

export const apiCall = {
  get: <TResponse>(url: string) => authenticatedFetch<TResponse>(url, 'GET'),
  post: <TResponse, TBody>(url: string, body?: TBody) => authenticatedFetch<TResponse, TBody>(url, 'POST', body),
  put: <TResponse, TBody>(url: string, body?: TBody) => authenticatedFetch<TResponse, TBody>(url, 'PUT', body),
  patch: <TResponse, TBody>(url: string, body?: TBody) => authenticatedFetch<TResponse, TBody>(url, 'PATCH', body),
  delete: <TResponse>(url: string) => authenticatedFetch<TResponse>(url, 'DELETE'),
  AuthError,
  ApiError,
}
