import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DashboardPayload } from '@/lib/dashboard-types'
import StatusStrip from './StatusStrip'

function payloadProps(
  overrides: Partial<DashboardPayload> = {},
): Pick<DashboardPayload, 'sessionPhase' | 'intradayPnl' | 'nextMacroEvent'> {
  const base: DashboardPayload = {
    sessionPhase: 'open',
    nextMacroEvent: {
      eventName: 'Macro release A',
      impactTier: 'high',
      at: '2026-04-23T13:30:00Z',
    },
    intradayPnl: [
      { t: '09:00', pnl: 0 },
      { t: '09:15', pnl: -120 },
      { t: '09:30', pnl: -340 },
    ],
    rule: {
      used: 340,
      cap: 2000,
      capReached: false,
      cooldownActive: false,
      cooldownUntil: null,
      quoteCurrency: 'USD',
    },
    primary: {
      instrument: {
        symbol: 'FUT-A',
        displayName: 'Mock Future A',
        tickSize: 0.25,
        tickValue: 5,
        quoteCurrency: 'USD',
      },
      state: 'HOLD',
      setup: null,
      lastPrice: 100,
      lastPriceAt: '2026-04-23T09:45:00Z',
      macro: null,
      bars: [],
      indicators: [],
    },
    watchlist: [],
    news: [],
    ...overrides,
  }
  return {
    sessionPhase: base.sessionPhase,
    intradayPnl: base.intradayPnl,
    nextMacroEvent: base.nextMacroEvent,
  }
}

describe('StatusStrip', () => {
  it('renders the latest cumulative P&L value with sign preserved', () => {
    render(<StatusStrip {...payloadProps()} />)
    // The last point of the intraday series is the "current" P&L by
    // convention. Negative sign is preserved so the glance reading
    // distinguishes a green-day from a red-day without color alone.
    expect(screen.getByText(/-340/)).toBeInTheDocument()
  })

  it('displays the session phase in a human-readable form', () => {
    render(<StatusStrip {...payloadProps({ sessionPhase: 'pre_open' })} />)
    // Underscore-separated enum values are translated for display. The
    // test matches on the visible label rather than the enum literal.
    expect(screen.getByText(/pre[-\s]open/i)).toBeInTheDocument()
  })

  it('names the upcoming macro event when one is scheduled', () => {
    render(<StatusStrip {...payloadProps()} />)
    expect(screen.getByText(/macro release a/i)).toBeInTheDocument()
  })

  it('falls back to a "no event" message when nothing is scheduled', () => {
    render(<StatusStrip {...payloadProps({ nextMacroEvent: null })} />)
    // The slot is always present so layout does not shift when an event
    // is added; the empty-state text tells the operator why it is blank.
    expect(screen.getByText(/no upcoming event/i)).toBeInTheDocument()
  })
})
