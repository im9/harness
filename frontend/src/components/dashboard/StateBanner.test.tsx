import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { InstrumentRowState } from '@/lib/dashboard-types'
import StateBanner from './StateBanner'

function row(overrides: Partial<InstrumentRowState> = {}): InstrumentRowState {
  const base: InstrumentRowState = {
    instrument: {
      symbol: 'FUT-A',
      displayName: 'Mock Future A',
      tickSize: 0.25,
      tickValue: 5,
      quoteCurrency: 'USD',
    },
    state: 'HOLD',
    setup: {
      setupName: 'Opening range break',
      side: 'long',
      target: { price: 17620.5, label: '+2R' },
      retreat: { price: 17548.75, label: 'stop' },
      rMultiple: 0,
    },
    lastPrice: 17582.25,
    lastPriceAt: '2026-04-23T09:45:00Z',
    macro: null,
    bars: [],
  }
  return { ...base, ...overrides }
}

describe('StateBanner', () => {
  it('announces the recommendation as a live status region', () => {
    render(<StateBanner row={row({ state: 'ENTER' })} />)
    // role=status is polite-live by default; screen readers announce
    // banner content on state transitions (HOLD→ENTER, any→RETREAT) which
    // is the primary a11y affordance called out in ADR 004 "motion and
    // notification".
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/ENTER/i)
  })

  it('surfaces the setup name and side when a setup is active', () => {
    render(<StateBanner row={row({ state: 'HOLD' })} />)
    expect(screen.getByText(/opening range break/i)).toBeInTheDocument()
    expect(screen.getByText(/long/i)).toBeInTheDocument()
  })

  it('shows the target and retreat labels when a setup is active', () => {
    render(<StateBanner row={row({ state: 'HOLD' })} />)
    // ADR 004 Visual language: target and retreat levels are labeled with
    // their R-multiple / role so the banner text alone conveys risk
    // context without requiring the chart.
    expect(screen.getByText(/\+2R/)).toBeInTheDocument()
    expect(screen.getByText(/stop/i)).toBeInTheDocument()
  })

  it('falls back to instrument-only display when no setup is active', () => {
    render(<StateBanner row={row({ state: 'HOLD', setup: null })} />)
    expect(screen.getByText(/mock future a/i)).toBeInTheDocument()
    expect(screen.queryByText(/\+2R/)).not.toBeInTheDocument()
  })

  it('exposes the state via a data attribute so CSS can style transitions', () => {
    // Testing data-state rather than a specific color class lets the
    // visual language (ADR 004: red for RETREAT, muted for HOLD, etc.)
    // evolve without rewriting the test. The attribute is the stable
    // contract between component and stylesheet.
    const { container, rerender } = render(
      <StateBanner row={row({ state: 'ENTER' })} />,
    )
    expect(container.querySelector('[data-state="enter"]')).not.toBeNull()
    rerender(<StateBanner row={row({ state: 'RETREAT' })} />)
    expect(container.querySelector('[data-state="retreat"]')).not.toBeNull()
  })
})
