import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Help from './Help'

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function mockFetch(): FetchMock {
  const fn = vi.fn() as FetchMock
  vi.stubGlobal('fetch', fn)
  return fn
}

function jsonResponse(status: number, body: unknown = []): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const ENTRIES = [
  {
    slug: 'vwap',
    titleEn: 'Volume Weighted Average Price',
    titleJa: '出来高加重平均価格',
    tags: ['chart', 'indicator'],
    bodyEn: 'EN body.',
    bodyJa: 'JA 本文。',
    aliasesEn: ['VWAP'],
    aliasesJa: ['ブイダブリュー'],
  },
  {
    slug: 'bid-ask',
    titleEn: 'Bid/Ask Spread',
    titleJa: 'ビッド・アスクスプレッド',
    tags: ['securities'],
    bodyEn: 'EN.',
    bodyJa: 'JA。',
    aliasesEn: ['spread'],
    aliasesJa: ['スプレッド'],
  },
  {
    slug: 'orb',
    titleEn: 'Opening Range Break',
    titleJa: 'オープニングレンジブレイク',
    tags: ['setup'],
    bodyEn: 'EN.',
    bodyJa: 'JA。',
    aliasesEn: ['ORB'],
    aliasesJa: ['ORB'],
  },
]

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/help']}>
      <Routes>
        <Route path="/help" element={<Help />} />
        <Route path="/help/:slug" element={<div data-testid="detail-route" />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Help route — list', () => {
  it('renders the fetched entries with their EN titles in default-language view', async () => {
    // Default language fallback is 'en' when no SettingsProvider is
    // mounted (i18n DEFAULT_LANGUAGE), so every list test sees the
    // EN title pair. The bilingual switch is tested below.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, ENTRIES))

    renderRoute()

    await screen.findByText('Volume Weighted Average Price')
    expect(screen.getByText('Bid/Ask Spread')).toBeInTheDocument()
    expect(screen.getByText('Opening Range Break')).toBeInTheDocument()
  })

  it('filters the list in-memory by title substring as the operator types', async () => {
    // Phase 1 Decision Q5: client-side filter on title (active
    // language) + alias substring + tag exact match.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, ENTRIES))
    renderRoute()
    await screen.findByText('Volume Weighted Average Price')

    const search = screen.getByRole('searchbox', { name: /search help/i })
    await userEvent.type(search, 'volume')

    await waitFor(() => {
      expect(
        screen.getByText('Volume Weighted Average Price'),
      ).toBeInTheDocument()
      expect(screen.queryByText('Bid/Ask Spread')).toBeNull()
      expect(screen.queryByText('Opening Range Break')).toBeNull()
    })
  })

  it('matches search against aliases (operators recall abbreviations)', async () => {
    // Regression guard: alias-only search lookups (the operator
    // remembers "ORB" but the title is "Opening Range Break") must
    // surface the entry, otherwise aliases are useless.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, ENTRIES))
    renderRoute()
    await screen.findByText('Opening Range Break')

    const search = screen.getByRole('searchbox', { name: /search help/i })
    await userEvent.type(search, 'orb')

    await waitFor(() => {
      expect(screen.getByText('Opening Range Break')).toBeInTheDocument()
      expect(
        screen.queryByText('Volume Weighted Average Price'),
      ).toBeNull()
    })
  })

  it('filters by tag pill click (exact match against neutral key)', async () => {
    // Phase 1 Decision Q5: tag filter is exact-match against the
    // language-neutral tag key. Display label may be localized but the
    // identity is the key.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, ENTRIES))
    renderRoute()
    await screen.findByText('Volume Weighted Average Price')

    const chartPill = screen.getByRole('button', { name: 'Chart' })
    await userEvent.click(chartPill)

    await waitFor(() => {
      expect(
        screen.getByText('Volume Weighted Average Price'),
      ).toBeInTheDocument()
      expect(screen.queryByText('Bid/Ask Spread')).toBeNull()
      expect(screen.queryByText('Opening Range Break')).toBeNull()
    })
  })

  it('clears the tag filter when the same pill is clicked again', async () => {
    // Toggle behaviour on the pill — re-clicking restores the full
    // list. Without it the operator's only escape from a tag filter
    // is a hidden "all" pill or page-level reset.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, ENTRIES))
    renderRoute()
    await screen.findByText('Volume Weighted Average Price')

    const chartPill = screen.getByRole('button', { name: 'Chart' })
    await userEvent.click(chartPill)
    await waitFor(() => {
      expect(screen.queryByText('Bid/Ask Spread')).toBeNull()
    })
    await userEvent.click(chartPill)

    await waitFor(() => {
      expect(screen.getByText('Bid/Ask Spread')).toBeInTheDocument()
    })
  })

  it('renders each entry as a Link to /help/:slug', async () => {
    // Direct-link contract: Phase 2 cross-links from chart labels and
    // state banners land as `<Link to={`/help/${slug}`}>`. The list
    // page is the bootstrapping consumer of that contract — clicking
    // an entry must navigate into the detail route.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, ENTRIES))
    renderRoute()
    await screen.findByText('Volume Weighted Average Price')

    const link = screen
      .getByText('Volume Weighted Average Price')
      .closest('a')
    expect(link).toHaveAttribute('href', '/help/vwap')
  })

  it('renders the empty-corpus state with the help-import hint when no entries are returned', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, []))
    renderRoute()

    expect(await screen.findByText(/help-import/i)).toBeInTheDocument()
  })

  it('renders the no-matches state when filters exclude every entry', async () => {
    // Distinct copy from "no entries yet" — the operator must be able
    // to tell "filter is too narrow" apart from "corpus is empty".
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, ENTRIES))
    renderRoute()
    await screen.findByText('Volume Weighted Average Price')

    const search = screen.getByRole('searchbox', { name: /search help/i })
    await userEvent.type(search, 'xyzzy')

    await waitFor(() => {
      expect(screen.getByText(/no entries match/i)).toBeInTheDocument()
    })
  })

  it('renders tag pills with the localized display label, not the raw key', async () => {
    // Phase 1 Decision Q5: tags are language-neutral keys with
    // display labels in the i18n dict. Default language is EN, so the
    // pill reads "Chart", not "chart". This pins the contract that
    // tags are translated for display.
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, ENTRIES))
    renderRoute()
    await screen.findByText('Volume Weighted Average Price')

    const filterRow = screen.getByLabelText(/filter by tag/i)
    expect(within(filterRow).getByRole('button', { name: 'Chart' })).toBeInTheDocument()
    expect(within(filterRow).getByRole('button', { name: 'Indicator' })).toBeInTheDocument()
    expect(within(filterRow).queryByText('chart')).toBeNull()
  })
})
