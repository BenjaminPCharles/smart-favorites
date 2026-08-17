import { beforeEach, describe, expect, it, vi } from 'vitest'

let currentToken = 'first'

vi.mock('~helpers/auth/session.helper', () => ({
  getSession: vi.fn(async () => ({ token: currentToken, expiresAt: Date.now() + 600_000 })),
  renewSession: vi.fn(async () => {
    currentToken = 'renewed'

    return { token: currentToken, expiresAt: Date.now() + 600_000 }
  }),
}))

vi.mock('~helpers/auth/session-store.helper', () => ({
  clearSession: vi.fn(async () => undefined),
}))

const { api } = await import('~helpers/api.helper')
const { ApiError, AuthError, DeviceRejectedError } = await import('~helpers/http.helper')
const session = await import('~helpers/auth/session.helper')

/** Authorization header off a recorded fetch call. */
function authorizationOf(call: unknown[]): string | undefined {
  const init = call[1] as RequestInit | undefined

  return (init?.headers as Record<string, string> | undefined)?.Authorization
}

describe('api.helper', () => {
  beforeEach(() => {
    currentToken = 'first'
    vi.mocked(session.renewSession).mockClear()
  })

  it('renews once and replays the request with the new token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await api.get('/favorites')).toEqual({ ok: true })
    expect(session.renewSession).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(authorizationOf(fetchMock.mock.calls[0] ?? [])).toBe('Bearer first')
    expect(authorizationOf(fetchMock.mock.calls[1] ?? [])).toBe('Bearer renewed')
  })

  it('gives up after a single renewal', async () => {
    // A factory and not mockResolvedValue, a Response body only reads once
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get('/favorites')).rejects.toBeInstanceOf(AuthError)
    // Two fetches, no more. The retry calls request() directly so there's no
    // recursion to loop
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(session.renewSession).toHaveBeenCalledTimes(1)
  })

  it('does not renew on a non-auth failure', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'Boom' }), { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.post('/favorites', { url: 'x' })).rejects.toThrow(ApiError)
    expect(session.renewSession).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces a rejected device as an AuthError subclass', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    vi.mocked(session.renewSession).mockRejectedValueOnce(new DeviceRejectedError())

    const error = await api.get('/favorites').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DeviceRejectedError)
    expect(error).toBeInstanceOf(AuthError)
  })
})
