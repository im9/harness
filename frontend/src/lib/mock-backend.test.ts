import { describe, expect, it } from 'vitest'
import { MockBackend } from './mock-backend'
import type { DashboardPayload } from './dashboard-types'

function seed(): DashboardPayload {
  // Two bars at 60-second spacing. The fixture is deliberately tiny so
  // advances are easy to count against. Anchor the initial last close
  // so downstream assertions on lastPrice / bar.close stay obvious.
  const t0 = 1_777_000_000
  return {
    sessionPhase: 'open',
    nextMacroEvent: null,
    intradayPnl: [
      { t: '09:00', pnl: 0 },
      { t: '09:15', pnl: -50 },
    ],
    rule: {
      used: 0,
      cap: 1000,
      capReached: false,
      cooldownActive: false,
      cooldownUntil: null,
      quoteCurrency: 'USD',
    },
    rows: [
      {
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
        lastPriceAt: new Date(t0 * 1000).toISOString(),
        macro: null,
        bars: [
          { time: t0, open: 100, high: 101, low: 99.5, close: 100.5, volume: 420 },
          { time: t0 + 60, open: 100.5, high: 101, low: 100, close: 100, volume: 380 },
        ],
        indicators: [
          {
            name: 'EMA20',
            kind: 'ema',
            points: [
              { time: t0, value: 100 },
              { time: t0 + 60, value: 100.1 },
            ],
          },
        ],
      },
    ],
  }
}

describe('MockBackend', () => {
  it('returns a cloned snapshot so callers cannot mutate internal state', () => {
    const backend = new MockBackend(seed())
    const a = backend.getSnapshot({ nowSec: 1_777_000_060, timeframes: { 'FUT-A': '1m' } })
    a.rows[0].lastPrice = -1
    const b = backend.getSnapshot({ nowSec: 1_777_000_060, timeframes: { 'FUT-A': '1m' } })
    // Second snapshot reflects backend truth, not the previous caller's
    // mutations. A leaky mock would corrupt React state under strict
    // mode, where effects fire twice and would otherwise see their
    // own previous mutations.
    expect(b.rows[0].lastPrice).not.toBe(-1)
  })

  it('appends one bar per elapsed BAR_STEP_SEC of simulated time', () => {
    const backend = new MockBackend(seed())
    const t0 = 1_777_000_000
    // Seed ends at t0 + 60 (2 bars). Advance 180 seconds → 3 more bars
    // expected, for a total of 5. BAR_STEP_SEC is 60 by construction in
    // mock-backend.ts; this asserts the append cadence without hard-
    // coding the constant.
    const snap = backend.getSnapshot({
      nowSec: t0 + 60 + 180,
      timeframes: { 'FUT-A': '1m' },
    })
    expect(snap.rows[0].bars.length).toBe(2 + 3)
  })

  it('pulls lastPrice forward to the newest bar close', () => {
    const backend = new MockBackend(seed())
    const snap = backend.getSnapshot({ nowSec: 1_777_000_000 + 60 + 120, timeframes: { 'FUT-A': '1m' } })
    const last = snap.rows[0].bars[snap.rows[0].bars.length - 1]
    // The banner reads lastPrice and the chart's right edge reads the
    // last bar close. If they diverge the UI misleads the operator.
    expect(snap.rows[0].lastPrice).toBe(last.close)
  })

  it('extends each indicator to match the new bar length', () => {
    const backend = new MockBackend(seed())
    const snap = backend.getSnapshot({ nowSec: 1_777_000_000 + 60 + 120, timeframes: { 'FUT-A': '1m' } })
    const row = snap.rows[0]
    // EMA lines must cover the same range as the candles or the chart
    // draws a truncated overlay that lies about the indicator value on
    // the newest bars.
    for (const indicator of row.indicators) {
      expect(indicator.points.length).toBe(row.bars.length)
    }
  })

  it('does not append bars when elapsed time is below one step', () => {
    const backend = new MockBackend(seed())
    const snap = backend.getSnapshot({
      nowSec: 1_777_000_000 + 60 + 30,
      timeframes: { 'FUT-A': '1m' },
    })
    // 30 s into the next step → still only 2 bars. The mock must not
    // emit partial bars; the engine contract is that bars are finalized.
    expect(snap.rows[0].bars.length).toBe(2)
  })
})
