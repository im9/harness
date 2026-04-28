import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { InstrumentRowState } from '@/lib/dashboard-types'
import StateBanner from './StateBanner'

function row(overrides: Partial<InstrumentRowState> = {}): InstrumentRowState {
  const base: InstrumentRowState = {
    instrument: {
      symbol: 'FUT-A',
      displayName: 'Mock Future A',
      venue: 'MOCK',
      tickSize: 0.25,
      tickValue: 5,
      quoteCurrency: 'USD',
    },
    state: 'range',
    setup: {
      setupName: 'Opening range break',
      side: 'long',
      target: { price: 17620.5, label: '+2R' },
      retreat: { price: 17548.75, label: 'stop' },
      rMultiple: 0,
      setupRange: null,
    },
    lastPrice: 17582.25,
    lastPriceAt: '2026-04-23T09:45:00Z',
    macro: null,
    bars: [],
    indicators: [],
  }
  return { ...base, ...overrides }
}

describe('StateBanner', () => {
  it('announces the trend as a live status region', () => {
    render(<StateBanner row={row({ state: 'up' })} />)
    // role=status is polite-live by default; screen readers announce
    // banner content on trend transitions (range→up, any→down) which
    // is the primary a11y affordance called out in ADR 004 "motion and
    // notification".
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/UP/i)
  })

  it('exposes the display name as the hero-level heading', () => {
    render(<StateBanner row={row({ state: 'up' })} />)
    // ADR 004 §State banner hierarchy: the hero line is the single
    // source of "what am I looking at" now that the active primary
    // is excluded from the watchlist. Promoting the display name to
    // a role=heading level=1 lets screen readers announce it as the
    // page's primary subject and keeps the visual hierarchy honest
    // against the rest of the dashboard typography.
    expect(
      screen.getByRole('heading', { level: 1, name: /mock future a/i }),
    ).toBeInTheDocument()
  })

  it('renders ticker and venue as the sub-line', () => {
    render(<StateBanner row={row({ state: 'range' })} />)
    // Sub-line disambiguates *which* market the instrument trades on.
    // Matters when the watchlist mixes asset classes across venues
    // (an "NKM" on OSE vs a ticker on another venue should never be
    // ambiguous). The test matches the combined "FUT-A · MOCK" glyph
    // rather than pulling them individually so the separator — the
    // sub-line's only visible divider — is asserted at the same time.
    expect(screen.getByText(/FUT-A\s*·\s*MOCK/)).toBeInTheDocument()
  })

  it('surfaces the setup name and side when a setup is active', () => {
    render(<StateBanner row={row({ state: 'range' })} />)
    expect(screen.getByText(/opening range break/i)).toBeInTheDocument()
    expect(screen.getByText(/long/i)).toBeInTheDocument()
  })

  it('shows the target and retreat labels when a setup is active', () => {
    render(<StateBanner row={row({ state: 'range' })} />)
    // ADR 004 Visual language: target and retreat levels are labeled with
    // their R-multiple / role so the banner text alone conveys risk
    // context without requiring the chart.
    expect(screen.getByText(/\+2R/)).toBeInTheDocument()
    expect(screen.getByText(/stop/i)).toBeInTheDocument()
  })

  it('falls back to instrument-only display when no setup is active', () => {
    render(<StateBanner row={row({ state: 'range', setup: null })} />)
    expect(screen.getByText(/mock future a/i)).toBeInTheDocument()
    expect(screen.queryByText(/\+2R/)).not.toBeInTheDocument()
  })

  it('exposes the state via a data attribute so CSS can style transitions', () => {
    // Testing data-state rather than a specific color class lets the
    // visual language (ADR 007: emerald for up, rose for down, muted
    // for range) evolve without rewriting the test. The attribute is
    // the stable contract between component and stylesheet.
    const { container, rerender } = render(
      <StateBanner row={row({ state: 'up' })} />,
    )
    expect(container.querySelector('[data-state="up"]')).not.toBeNull()
    rerender(<StateBanner row={row({ state: 'down' })} />)
    expect(container.querySelector('[data-state="down"]')).not.toBeNull()
  })
})
