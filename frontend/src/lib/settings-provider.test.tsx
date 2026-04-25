import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSettings } from './settings-context'
import { useDisplayTimezone } from './settings-context'
import { SettingsProvider } from './settings-provider'

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

function StatusProbe() {
  const { status } = useSettings()
  return <span data-testid="status">{status}</span>
}

function TimezoneProbe() {
  const tz = useDisplayTimezone()
  return <span data-testid="tz">{tz}</span>
}

function SaveProbe() {
  const { save } = useSettings()
  return (
    <button
      onClick={() =>
        void save({
          localization: { displayTimezone: 'America/New_York', language: 'en' },
        })
      }
    >
      do-save
    </button>
  )
}

describe('SettingsProvider', () => {
  it('fetches /api/settings on mount and exposes the document via context', async () => {
    // Mount-time fetch is the authoritative load: every consumer
    // (chart axis, NewsFeed exact time) reads from this single source
    // so a successful first GET is what unblocks the "ready" state.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { localization: { displayTimezone: 'Asia/Tokyo' } }),
    )

    render(
      <SettingsProvider>
        <StatusProbe />
        <TimezoneProbe />
      </SettingsProvider>,
    )

    expect(screen.getByTestId('status').textContent).toBe('loading')
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ready')
    })
    expect(screen.getByTestId('tz').textContent).toBe('Asia/Tokyo')
  })

  it('falls back to the default timezone while loading and on error', async () => {
    // Pre-resolve render: useDisplayTimezone must already return a
    // valid IANA zone so the chart / NewsFeed do not hand an empty
    // string to Intl.DateTimeFormat (which would throw).
    // Asia/Tokyo is the documented default (matches the constant
    // currently in lib/display-timezone.ts that this slice replaces).
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { detail: 'kaboom' }))

    render(
      <SettingsProvider>
        <StatusProbe />
        <TimezoneProbe />
      </SettingsProvider>,
    )

    // Loading frame: tz is the default fallback.
    expect(screen.getByTestId('tz').textContent).toBe('Asia/Tokyo')
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('error')
    })
    // Error frame: tz still falls back to the default; the rest of
    // the app must keep rendering rather than wedge on a missing
    // setting.
    expect(screen.getByTestId('tz').textContent).toBe('Asia/Tokyo')
  })

  it('save() PUTs the document and refreshes the context value from the response', async () => {
    // The post-save echo is the canonical state — the provider must
    // adopt that (not the optimistic input) so any backend coercion
    // is reflected. Today there's no coercion, but the contract
    // leaves room (e.g. trimming whitespace, normalising case).
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { localization: { displayTimezone: 'Asia/Tokyo' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { localization: { displayTimezone: 'America/New_York' } }),
      )

    render(
      <SettingsProvider>
        <TimezoneProbe />
        <SaveProbe />
      </SettingsProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('tz').textContent).toBe('Asia/Tokyo')
    })

    await userEvent.click(screen.getByText('do-save'))

    await waitFor(() => {
      expect(screen.getByTestId('tz').textContent).toBe('America/New_York')
    })
  })
})

describe('useDisplayTimezone outside SettingsProvider', () => {
  it('returns the default timezone when no provider is mounted', () => {
    // PriceChart and NewsFeed test files render their components
    // bare (no provider wrap) for snapshot focus. The hook must
    // tolerate that and return the default rather than throwing,
    // otherwise we would have to wrap every existing test.
    render(<TimezoneProbe />)
    expect(screen.getByTestId('tz').textContent).toBe('Asia/Tokyo')
  })
})
