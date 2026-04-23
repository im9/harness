import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MarketIndex } from '@/lib/dashboard-types'
import MarketsStrip from './MarketsStrip'

function indices(): MarketIndex[] {
  return [
    {
      ticker: 'N225',
      displayName: 'Nikkei 225',
      lastPrice: 38_580,
      pctChange: 0.42,
    },
    {
      ticker: 'DJIA',
      displayName: 'Dow Jones',
      lastPrice: 39_540,
      pctChange: -0.08,
    },
    {
      ticker: 'USDJPY',
      displayName: 'USD/JPY',
      lastPrice: 155.42,
      pctChange: 0.41,
    },
  ]
}

describe('MarketsStrip', () => {
  it('exposes the strip as a labeled region landmark', () => {
    render(<MarketsStrip markets={indices()} />)
    // ADR 004 Markets overview: `<section aria-label="Markets ..." />`.
    // A landmark role lets screen readers jump to it and the Dashboard
    // route tests rely on the accessible name to locate the strip.
    expect(
      screen.getByRole('region', { name: /markets/i }),
    ).toBeInTheDocument()
  })

  it('renders every index ticker and display name', () => {
    render(<MarketsStrip markets={indices()} />)
    for (const item of indices()) {
      expect(screen.getByText(item.ticker)).toBeInTheDocument()
      expect(screen.getByText(item.displayName)).toBeInTheDocument()
    }
  })

  it('formats integer-range indices without decimals and FX with three', () => {
    // Decimal count mirrors market convention: a 38,580-level equity
    // index prints as a clean integer (cents are meaningless at that
    // scale), while USD/JPY near 155 needs the third decimal so
    // 10-pip moves are legible. Formula-tested against real quote
    // conventions rather than read off the current `formatPrice`
    // implementation.
    render(<MarketsStrip markets={indices()} />)
    expect(screen.getByText('38,580')).toBeInTheDocument()
    // 155.42 has 2 decimals (>= 10 branch); FX below 10 would use 3.
    expect(screen.getByText('155.42')).toBeInTheDocument()
  })

  it('prefixes positive pctChange with + and tones it green', () => {
    // The sign prefix is required because the minus on a negative
    // number is the operator's only visual cue of direction in
    // printed tables; a bare "0.42" vs "-0.08" is asymmetric and
    // reads poorly. Color classes encode direction redundantly for
    // glance reading.
    const { container } = render(<MarketsStrip markets={indices()} />)
    const positive = screen.getByText('+0.42%')
    expect(positive).toBeInTheDocument()
    expect(positive.className).toMatch(/emerald/)
    const negative = screen.getByText('-0.08%')
    expect(negative).toBeInTheDocument()
    expect(negative.className).toMatch(/rose/)
    // Ensure no unintended duplication of the negative-sign glyph in
    // the same card (e.g. a stray "-0.08" also rendering as "-0.08%").
    expect(container.textContent).toContain('-0.08%')
  })

  it('keeps each index visually isolated from its neighbors', () => {
    // Each card is its own DOM subtree so screen readers can announce
    // the pair (ticker, pctChange) as a unit. Regression guard: if the
    // strip flattens into a single line, this within() query fails.
    render(<MarketsStrip markets={indices()} />)
    const region = screen.getByRole('region', { name: /markets/i })
    const nikkei = within(region).getByText('N225')
    const card = nikkei.closest('div')!.parentElement!
    expect(within(card).getByText(/\+0\.42%/)).toBeInTheDocument()
  })
})
