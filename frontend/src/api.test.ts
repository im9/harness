import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './api'

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function mockFetch(): FetchMock {
  const fn = vi.fn() as FetchMock
  vi.stubGlobal('fetch', fn)
  return fn
}

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('sends credentials: include so the httpOnly auth cookies attach', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))

    await apiFetch('/api/me')

    // Contract: without credentials:'include', the browser drops cookies on
    // same-origin fetch when there's any middleware/fetch-policy surprise.
    // We opt in on every request instead of relying on site defaults.
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('on 401 from a non-auth endpoint, attempts refresh and retries once', async () => {
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401)) // original
      .mockResolvedValueOnce(jsonResponse(200)) // refresh
      .mockResolvedValueOnce(jsonResponse(200, { id: 1, username: 'a' })) // retry

    const res = await apiFetch('/api/me')

    // Three calls in order: original → /api/auth/refresh (POST) → original retry.
    // This flow is what keeps the UX smooth across the 15-min access-token TTL.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh')
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    expect(res.status).toBe(200)
  })

  it('if refresh fails, returns the original 401 (no further retry)', async () => {
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401)) // original
      .mockResolvedValueOnce(jsonResponse(401)) // refresh failed

    const res = await apiFetch('/api/me')

    // Exactly two calls: original + one refresh attempt. No third retry —
    // that would be an infinite loop on an expired/revoked session. The
    // caller (AuthProvider) treats this 401 as "session is dead".
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(res.status).toBe(401)
  })

  it('does not attempt refresh when the 401 comes from /api/auth/login', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(401))

    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '', password: '', totp_code: '' }),
    })

    // A 401 from /login is "invalid credentials" — retrying via refresh
    // is semantically wrong (there is no session to refresh yet) and would
    // leak information by changing the failure mode.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(401)
  })

  it('does not attempt refresh when the 401 comes from /api/auth/refresh itself', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(401))

    const res = await apiFetch('/api/auth/refresh', { method: 'POST' })

    // Without this guard, a failing refresh would trigger another refresh
    // recursively. One call is the only correct behavior.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(401)
  })

  it('passes through non-401 responses unchanged (no refresh attempt)', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { detail: 'boom' }))

    const res = await apiFetch('/api/me')

    // Refresh must only fire on 401. A 500, 403, 404 etc. is its own story.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(500)
  })
})
