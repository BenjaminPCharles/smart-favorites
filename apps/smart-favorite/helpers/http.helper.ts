export const API_BASE = process.env.PLASMO_PUBLIC_API_BASE ?? 'http://localhost:3000'

export class AuthError extends Error {
  constructor(message = 'Unauthenticated') {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * No device key in IndexedDB, nothing can be signed. Extends AuthError so existing
 * `instanceof AuthError` call sites keep working, while the UI can still tell this
 * apart from an expired session.
 */
export class DeviceMissingError extends AuthError {
  constructor() {
    super('No device key on this browser')
    this.name = 'DeviceMissingError'
  }
}

/** The server refused the device key itself: unknown, or revoked. */
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

/** Tolerates an empty body (204, or an error that came back without one). */
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
 * Non-2xx becomes a throw. `url` is absolute, `token` omitted for public routes.
 * This module knows nothing about auth, it just uses a token if handed one, which is
 * what lets the session layer call it without an import cycle.
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
