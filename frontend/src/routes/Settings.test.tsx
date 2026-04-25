import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SettingsProvider } from '@/lib/settings-provider'
import Settings from './Settings'

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

function renderRoute() {
  return render(
    <MemoryRouter>
      <SettingsProvider>
        <Settings />
      </SettingsProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Settings route — Localization panel', () => {
  it('hydrates the Display timezone field with the saved value', async () => {
    // Phase A only carries `localization.displayTimezone`; the panel
    // must reflect the persisted value rather than always rendering
    // the default. Otherwise a save would be silently overwritten by
    // the initial render's default the next time the operator visits.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        localization: { displayTimezone: 'America/New_York', language: 'en' },
      }),
    )

    renderRoute()

    const select = (await screen.findByLabelText(
      /display timezone/i,
    )) as HTMLSelectElement
    await waitFor(() => {
      expect(select.value).toBe('America/New_York')
    })
  })

  it('PUTs the new timezone on submit and shows a success message', async () => {
    // Save semantic per ADR 009: persist on submit, success state
    // visible to the operator. Without the success affordance, the
    // operator can't tell a successful save from a no-op render.
    // Pinning language to 'en' so the panel renders in English and
    // the existing /save/i / /saved/i regex assertions match.
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          localization: { displayTimezone: 'Asia/Tokyo', language: 'en' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          localization: { displayTimezone: 'UTC', language: 'en' },
        }),
      )

    renderRoute()

    const select = (await screen.findByLabelText(
      /display timezone/i,
    )) as HTMLSelectElement
    await waitFor(() => {
      expect(select.value).toBe('Asia/Tokyo')
    })

    await userEvent.selectOptions(select, 'UTC')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      // PUT body carries the new timezone — proves the form is
      // sending the operator's selection rather than the original
      // value. `language` rides along since Phase A's full-document
      // PUT shape requires it.
      const putCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
      )
      expect(putCall).toBeDefined()
      const body = (putCall![1] as RequestInit).body
      expect(JSON.parse(body as string)).toEqual({
        localization: { displayTimezone: 'UTC', language: 'en' },
      })
    })

    // Success affordance — exact wording matters less than presence,
    // but the operator needs an unambiguous "this saved" cue. We
    // assert on a status role so the message is announced to AT.
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i)
  })

  it('surfaces a backend rejection without losing the operator selection', async () => {
    // 422 = the backend rejected the body (unknown timezone). The form
    // must show an error AND keep the operator's draft selection so
    // they can retry without re-entering the value. Resetting to the
    // last-saved value here would frustrate the recovery path.
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          localization: { displayTimezone: 'Asia/Tokyo', language: 'en' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(422, { detail: 'bad zone' }))

    renderRoute()

    const select = (await screen.findByLabelText(
      /display timezone/i,
    )) as HTMLSelectElement
    await waitFor(() => {
      expect(select.value).toBe('Asia/Tokyo')
    })

    await userEvent.selectOptions(select, 'UTC')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/save failed/i)
    expect(select.value).toBe('UTC')
  })

  it('saves a language change and the panel re-renders in the new language', async () => {
    // The operator's language toggle is the live test of i18n: pick
    // Japanese, save, and the panel itself must re-render in JA on
    // the next paint. This locks two contracts at once — the PUT
    // carries the new language, and the surface re-reads from
    // settings context (rather than a stale snapshot).
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          localization: { displayTimezone: 'Asia/Tokyo', language: 'en' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          localization: { displayTimezone: 'Asia/Tokyo', language: 'ja' },
        }),
      )

    renderRoute()

    const language = (await screen.findByLabelText(
      /ui language/i,
    )) as HTMLSelectElement
    await waitFor(() => {
      expect(language.value).toBe('en')
    })

    await userEvent.selectOptions(language, 'ja')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    // After the PUT settles, the panel re-reads from settings and
    // re-renders. The Save button label is the most stable JA
    // assertion — `保存` is the dictionary value for `settings.save`,
    // and a regression that left the page on the previous language
    // would still show `Save`.
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /保存/ }),
      ).toBeInTheDocument()
    })

    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    )
    expect(putCall).toBeDefined()
    const body = (putCall![1] as RequestInit).body
    expect(JSON.parse(body as string)).toEqual({
      localization: { displayTimezone: 'Asia/Tokyo', language: 'ja' },
    })
  })
})
