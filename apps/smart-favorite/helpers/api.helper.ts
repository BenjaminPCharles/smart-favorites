import browser from 'webextension-polyfill'

const API_BASE = 'http://localhost:3001'

class AuthError extends Error {
  constructor() {
    super('Unauthenticated')
  }
}

async function authenticatedFetch<TResponse, TBody = undefined>(url: string, method: string, body?: TBody): Promise<TResponse> {
  const result = await browser.storage.local.get('private_key')
  const token = typeof result.private_key === 'string' ? result.private_key : undefined

  if (!token) {
    throw new AuthError()
  }

  const verifyResponse = await fetch(`${API_BASE}/auth/verify`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!verifyResponse.ok) {
    throw new AuthError()
  }

  const response = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  return response.json() as Promise<TResponse>
}

export const api = {
  get: <TResponse>(url: string) => authenticatedFetch<TResponse>(url, 'GET'),
  post: <TResponse, TBody>(url: string, body?: TBody) => authenticatedFetch<TResponse, TBody>(url, 'POST', body),
  put: <TResponse, TBody>(url: string, body?: TBody) => authenticatedFetch<TResponse, TBody>(url, 'PUT', body),
  patch: <TResponse, TBody>(url: string, body?: TBody) => authenticatedFetch<TResponse, TBody>(url, 'PATCH', body),
  delete: <TResponse>(url: string) => authenticatedFetch<TResponse>(url, 'DELETE'),
  AuthError,
}
