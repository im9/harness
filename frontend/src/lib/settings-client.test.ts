import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SettingsRequestError,
  getSettings,
  putSettings,
} from './settings-client'

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function mockFetch(): FetchMock {
  const fn = vi.fn() as FetchMock
  vi.stubGlobal('fetch', fn)
  return fn
}

function jsonResponse(status: number, body: unknown = {}): Response {
  const hasBody = status !== 204 && status !== 205 && status !== 304
  return new Response(hasBody ? JSON.stringify(body) : null, {
    status,
    headers: hasBody ? { 'Content-Type': 'application/json' } : {},
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('settings-client', () => {
  it('GETs /api/settings with credentials and returns the parsed document', async () => {
    // The auth model relies on the access cookie travelling with every
    // request (ADR 001 §Token strategy); going through `apiFetch`
    // applies `credentials: 'include'` for us. A bare `fetch` here
    // would silently lose the cookie and 401.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { localization: { displayTimezone: 'Asia/Tokyo' } }),
    )

    const out = await getSettings()

    expect(out).toEqual({ localization: { displayTimezone: 'Asia/Tokyo' } })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('throws SettingsRequestError on non-OK GET', async () => {
    // Surface the HTTP status via a typed error so callers can
    // distinguish "not logged in" (401) from "schema rejected"
    // (422 — only meaningful on PUT) without parsing the body.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { detail: 'kaboom' }))

    await expect(getSettings()).rejects.toBeInstanceOf(SettingsRequestError)
  })

  it('PUTs /api/settings with JSON body and returns the persisted document', async () => {
    // Backend echoes the saved document; we return that so the caller
    // can update local state from the canonical post-save value (in
    // case the backend coerced or normalised anything — none today,
    // but the contract leaves room).
    const fetchMock = mockFetch()
    const saved = { localization: { displayTimezone: 'America/New_York', language: 'en' as const } }
    fetchMock.mockResolvedValueOnce(jsonResponse(200, saved))

    const out = await putSettings(saved)

    expect(out).toEqual(saved)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        body: JSON.stringify(saved),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('throws SettingsRequestError carrying the status on non-OK PUT', async () => {
    // 422 = Pydantic rejected the body (unknown timezone). The caller
    // wants the status so it can render a field-level error rather
    // than a generic toast.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(422, { detail: 'bad zone' }))

    let thrown: unknown
    try {
      await putSettings({
        localization: { displayTimezone: 'Mars/Olympus_Mons', language: 'ja' },
      })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(SettingsRequestError)
    expect((thrown as SettingsRequestError).status).toBe(422)
  })
})
