import browser from 'webextension-polyfill'

export const API_BASE = process.env.PLASMO_PUBLIC_API_BASE ?? 'http://localhost:3000'

export class AuthError extends Error {
  constructor() {
    super('Unauthenticated')
    this.name = 'AuthError'
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
 * The server authenticates every protected route itself, so there is no
 * pre-flight /auth/verify call here — a bad token simply comes back as a 401.
 * @param url absolute url
 * @param method
 * @param token bearer token, omitted for public routes
 * @param body
 * @return {Promise<TResponse>}
 */
async function request<TResponse, TBody = undefined>(url: string, method: string, token?: string, body?: TBody): Promise<TResponse> {
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

/**
 * Read the stored token.
 * @return {Promise<string>}
 * @throws {AuthError} when no token is stored
 */
async function getStoredToken(): Promise<string> {
  const result = await browser.storage.local.get('private_key')
  const token = typeof result.private_key === 'string' ? result.private_key : undefined

  if (!token) {
    throw new AuthError()
  }

  return token
}

async function authenticatedFetch<TResponse, TBody = undefined>(url: string, method: string, body?: TBody): Promise<TResponse> {
  return request<TResponse, TBody>(`${API_BASE}${url}`, method, await getStoredToken(), body)
}

/**
 * Create a new anonymous account. Public route, no token needed.
 * @return {Promise<string>} the bearer token, shown to the user as their key
 */
export async function authInit(): Promise<string> {
  const { token } = await request<{ token: string }>(`${API_BASE}/auth/init`, 'POST')
  return token
}

/**
 * Check a token against the server, before it is stored.
 * @param token
 * @return {Promise<boolean>} false when the server rejects it
 */
export async function authVerify(token: string): Promise<boolean> {
  try {
    await request<{ publicId: string }>(`${API_BASE}/auth/verify`, 'GET', token)
    return true
  }
  catch (error) {
    if (error instanceof AuthError) {
      return false
    }
    throw error
  }
}

export const api = {
  get: <TResponse>(url: string) => authenticatedFetch<TResponse>(url, 'GET'),
  post: <TResponse, TBody>(url: string, body?: TBody) => authenticatedFetch<TResponse, TBody>(url, 'POST', body),
  put: <TResponse, TBody>(url: string, body?: TBody) => authenticatedFetch<TResponse, TBody>(url, 'PUT', body),
  patch: <TResponse, TBody>(url: string, body?: TBody) => authenticatedFetch<TResponse, TBody>(url, 'PATCH', body),
  delete: <TResponse>(url: string) => authenticatedFetch<TResponse>(url, 'DELETE'),
  AuthError,
}
