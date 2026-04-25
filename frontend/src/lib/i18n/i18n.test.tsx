import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsProvider } from '@/lib/settings-provider'
import { interpolate, useTranslation } from './index'

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

describe('interpolate', () => {
  it('substitutes named placeholders', () => {
    // Why this exact pair: confirms the helper handles two distinct
    // placeholders in one string without leaking the previous match.
    expect(interpolate('Hello {a} and {b}', { a: 'one', b: 'two' })).toBe(
      'Hello one and two',
    )
  })

  it('leaves unknown placeholders intact so missing vars surface visibly', () => {
    // A silently-empty interpolation hides bugs (button reads "Save "
    // instead of "Save (HTTP 500)"). Returning the literal `{status}`
    // makes the missing var loud — visible in the rendered UI rather
    // than only on a failed test.
    expect(interpolate('Save failed (HTTP {status}).', {})).toBe(
      'Save failed (HTTP {status}).',
    )
  })

  it('coerces number vars to strings', () => {
    // TOTP_LENGTH and HTTP status codes arrive as numbers; the API
    // accepts both number and string vars so callers don't have to
    // pre-stringify everywhere.
    expect(interpolate('{n}-digit code', { n: 6 })).toBe('6-digit code')
  })
})

// Probe components — Settings is loaded via the SettingsProvider's
// /api/settings fetch, which the mocked fetch intercepts.
function LangProbe() {
  const { t } = useTranslation()
  return <span data-testid="copy">{t('appShell.nav.dashboard')}</span>
}

function VarsProbe() {
  const { t } = useTranslation()
  return (
    <span data-testid="copy">
      {t('login.totp.description', { length: 6 })}
    </span>
  )
}

describe('useTranslation', () => {
  it('returns Japanese strings when settings.language is ja', async () => {
    // Default backend response carries language=ja per ADR 009 —
    // Japanese is the operator's first language. The probe asserts
    // a stable, non-empty Japanese string that will not drift unless
    // the dashboard nav itself is renamed.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        localization: { displayTimezone: 'Asia/Tokyo', language: 'ja' },
      }),
    )

    render(
      <SettingsProvider>
        <LangProbe />
      </SettingsProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('copy').textContent).toBe('ダッシュボード')
    })
  })

  it('returns English strings when settings.language is en', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        localization: { displayTimezone: 'Asia/Tokyo', language: 'en' },
      }),
    )

    render(
      <SettingsProvider>
        <LangProbe />
      </SettingsProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('copy').textContent).toBe('Dashboard')
    })
  })

  it('falls back to English outside a SettingsProvider (test fallback)', () => {
    // Bare-render path: dashboard widget tests render their components
    // without wrapping in SettingsProvider. The hook returns the
    // English fallback so existing assertions on English copy keep
    // passing without a per-test wrapper. Production mounts the
    // provider above any consumer, so this fallback only applies to
    // tests + the brief pre-provider boot window (ProtectedRoute's
    // loading state).
    render(<LangProbe />)
    expect(screen.getByTestId('copy').textContent).toBe('Dashboard')
  })

  it('interpolates vars into the resolved message', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        localization: { displayTimezone: 'Asia/Tokyo', language: 'en' },
      }),
    )

    render(
      <SettingsProvider>
        <VarsProbe />
      </SettingsProvider>,
    )

    await waitFor(() => {
      // English version of `login.totp.description` with `{length}`
      // substituted for 6. The exact string is the dictionary's
      // English entry — a brittle equality check is fine because the
      // dictionary is the source of truth for this contract.
      expect(screen.getByTestId('copy').textContent).toBe(
        '6-digit code from your authenticator app (not the setup secret).',
      )
    })
  })
})
