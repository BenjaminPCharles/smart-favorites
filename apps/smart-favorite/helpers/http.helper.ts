export const API_BASE = process.env.PLASMO_PUBLIC_API_BASE ?? 'http://localhost:3000'

export class AuthError extends Error {
  constructor(message = 'Unauthenticated') {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * No device key in IndexedDB, so nothing can be signed. Extends AuthError so every
 * existing `instanceof AuthError` call site keeps working while the UI can still
 * tell this apart from an expired session.
 */
export class DeviceMissingError extends AuthError {
  constructor() {
    super('No device key on this browser')
    this.name = 'DeviceMissingError'
  }
}

/** The server refused the device key itself — unknown, or revoked. */
export class DeviceRejectedError extends AuthError {
  constructor() {
    super('This device is no longer authorised')
    this.name = 'DeviceRejectedError'
  }
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Read the response body, tolerating empty ones (204, or an error with no body).
 * @param response
 * @return {Promise<unknown>}
 */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return undefined
  }

  try {
    return JSON.parse(text) as unknown
  }
  catch {
    return text
  }
}

/**
 * Send a request and turn any non-2xx into a thrown error.
 *
 * This module knows nothing about auth: it takes a token if it is given one. That
 * separation is what lets the session layer call it without an import cycle.
 * @param url absolute url
 * @param method
 * @param token bearer token, omitted for public routes
 * @param body
 * @return {Promise<TResponse>}
 */
export async function request<TResponse, TBody = undefined>(url: string, method: string, token?: string, body?: TBody): Promise<TResponse> {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const payload = await readBody(response)

  if (response.status === 401) {
    throw new AuthError()
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'message' in payload
      ? String((payload as { message: unknown }).message)
      : response.statusText
    throw new ApiError(response.status, message)
  }

  return payload as TResponse
}
