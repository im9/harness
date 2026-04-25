import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import HelpDetail from './HelpDetail'

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function mockFetch(): FetchMock {
  const fn = vi.fn() as FetchMock
  vi.stubGlobal('fetch', fn)
  return fn
}

function jsonResponse(status: number, body: unknown = null): Response {
  const hasBody = status !== 204 && status !== 304
  return new Response(hasBody ? JSON.stringify(body) : null, {
    status,
    headers: hasBody ? { 'Content-Type': 'application/json' } : {},
  })
}

const VWAP = {
  slug: 'vwap',
  titleEn: 'Volume Weighted Average Price',
  titleJa: '出来高加重平均価格',
  tags: ['chart', 'indicator'],
  bodyEn: 'A reference line plotting the day’s **average traded price**.',
  bodyJa: 'その日の**出来高加重平均**価格を示す基準線。',
  aliasesEn: ['VWAP'],
  aliasesJa: ['VWAP'],
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/help" element={<div data-testid="list-route" />} />
        <Route path="/help/:slug" element={<HelpDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HelpDetail route — /help/:slug', () => {
  it('renders the entry title in the active language and the markdown body', async () => {
    // Default-language fallback is EN (no SettingsProvider mounted in
    // the test render). The detail header shows the EN title; the
    // markdown body parses `**…**` to <strong>.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VWAP))

    renderAt('/help/vwap')

    const article = await screen.findByRole('article', {
      name: /help entry detail/i,
    })
    expect(
      within(article).getByRole('heading', {
        name: 'Volume Weighted Average Price',
      }),
    ).toBeInTheDocument()
    // Markdown rendered: bold span exists as <strong>.
    expect(within(article).getByText('average traded price').tagName).toBe(
      'STRONG',
    )
  })

  it('shows a back link to /help', async () => {
    // The detail page must offer a single-tap escape to the list. URL
    // back works too (router history) but a visible link is the
    // discoverable affordance — same reasoning that retired the `?`
    // shortcut for opening help in the first place.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VWAP))
    renderAt('/help/vwap')
    await screen.findByRole('article', { name: /help entry detail/i })

    const backLink = screen.getByRole('link', { name: /back to help/i })
    expect(backLink).toHaveAttribute('href', '/help')
  })

  it('renders a not-found state when the API returns 404', async () => {
    // Stale cross-link / typo'd URL must show a clean not-found page,
    // not a blank surface or an error boundary trip. The
    // `fetchHelpEntry` helper collapses 404 to null specifically for
    // this UX.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { detail: 'gone' }))

    renderAt('/help/missing-slug')

    await waitFor(() => {
      expect(
        screen.getByText(/help entry not found/i),
      ).toBeInTheDocument()
    })
  })

  it('does not execute raw HTML script tags from markdown bodies', async () => {
    // react-markdown's safe defaults strip raw HTML — the markdown
    // body cannot inject a live <script>. Pin the contract so a
    // future renderer swap (or a remark plugin that enables raw HTML)
    // doesn't silently regress.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ...VWAP,
        bodyEn: '<script>window.__pwned = true</script>safe text',
      }),
    )

    renderAt('/help/vwap')
    const article = await screen.findByRole('article', {
      name: /help entry detail/i,
    })
    expect(article.querySelector('script')).toBeNull()
    expect(
      (window as unknown as { __pwned?: boolean }).__pwned,
    ).toBeUndefined()
  })

  it('shows a loading state before the fetch resolves', async () => {
    // The fetch is async — the operator must see a loading affordance
    // rather than an empty card during the round-trip. Otherwise the
    // route looks broken on slow links.
    const fetchMock = mockFetch()
    let resolve: (r: Response) => void = () => {}
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((r) => {
        resolve = r
      }),
    )

    renderAt('/help/vwap')

    expect(screen.getByText(/loading entry/i)).toBeInTheDocument()

    resolve(jsonResponse(200, VWAP))
    await screen.findByRole('article', { name: /help entry detail/i })
  })

  it('renders the localized tag labels, not the raw keys', async () => {
    // Same Phase 1 Decision Q5 contract as the list page — display
    // labels go through the i18n dict; the neutral key never reaches
    // the operator's eye.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VWAP))
    renderAt('/help/vwap')
    const article = await screen.findByRole('article', {
      name: /help entry detail/i,
    })
    const tagRow = within(article).getByLabelText(/tags/i)
    expect(within(tagRow).getByText('Chart')).toBeInTheDocument()
    expect(within(tagRow).getByText('Indicator')).toBeInTheDocument()
    expect(within(tagRow).queryByText('chart')).toBeNull()
  })
})
