import { describe, expect, it } from 'vitest'
import { MockBackend } from './mock-backend'
import type { MockBackendSeed } from './mock-backend'
import type { InstrumentRowState } from './dashboard-types'

const T0 = 1_777_000_000

function futARow(): InstrumentRowState {
  // Two bars at 60-second spacing. The fixture is deliberately tiny so
  // advances are easy to count against. Anchor the initial last close
  // so downstream assertions on lastPrice / bar.close stay obvious.
  return {
    instrument: {
      symbol: 'FUT-A',
      displayName: 'Mock Future A',
      venue: 'MOCK',
      tickSize: 0.25,
      tickValue: 5,
      quoteCurrency: 'USD',
    },
    state: 'HOLD',
    setup: null,
    lastPrice: 100,
    lastPriceAt: new Date(T0 * 1000).toISOString(),
    macro: null,
    bars: [
      { time: T0, open: 100, high: 101, low: 99.5, close: 100.5, volume: 420 },
      { time: T0 + 60, open: 100.5, high: 101, low: 100, close: 100, volume: 380 },
    ],
    indicators: [
      {
        name: 'EMA20',
        kind: 'ema',
        points: [
          { time: T0, value: 100 },
          { time: T0 + 60, value: 100.1 },
        ],
      },
    ],
  }
}

function futBRow(): InstrumentRowState {
  // Parallel fixture to exercise the universe-plus-swap path. Same
  // cadence as FUT-A so the tf-matching branch in the backend picks
  // the seed bars up for both.
  return {
    instrument: {
      symbol: 'FUT-B',
      displayName: 'Mock Future B',
      venue: 'MOCK',
      tickSize: 0.5,
      tickValue: 10,
      quoteCurrency: 'USD',
    },
    state: 'ENTER',
    setup: null,
    lastPrice: 200,
    lastPriceAt: new Date(T0 * 1000).toISOString(),
    macro: null,
    bars: [
      { time: T0, open: 200, high: 201, low: 199, close: 200.5, volume: 300 },
      { time: T0 + 60, open: 200.5, high: 201.5, low: 200, close: 201, volume: 320 },
    ],
    indicators: [],
  }
}

function seed(rows: InstrumentRowState[] = [futARow()]): MockBackendSeed {
  const universe = rows
  const pctChanges: Record<string, number> = {}
  for (const row of universe) pctChanges[row.instrument.symbol] = 0
  return {
    universe,
    pctChanges,
    defaultPrimary: universe[0].instrument.symbol,
    common: {
      rule: {
        used: 0,
        cap: 1000,
        capReached: false,
        cooldownActive: false,
        cooldownUntil: null,
        quoteCurrency: 'USD',
      },
      markets: [],
      news: [],
    },
  }
}

describe('MockBackend', () => {
  it('returns a cloned snapshot so callers cannot mutate internal state', () => {
    const backend = new MockBackend(seed())
    const a = backend.getSnapshot({ nowSec: T0 + 60, timeframes: { 'FUT-A': '1m' } })
    a.primary.lastPrice = -1
    const b = backend.getSnapshot({ nowSec: T0 + 60, timeframes: { 'FUT-A': '1m' } })
    // Second snapshot reflects backend truth, not the previous caller's
    // mutations. A leaky mock would corrupt React state under strict
    // mode, where effects fire twice and would otherwise see their
    // own previous mutations.
    expect(b.primary.lastPrice).not.toBe(-1)
  })

  it('appends one bar per elapsed BAR_STEP_SEC of simulated time', () => {
    const backend = new MockBackend(seed())
    // Seed ends at T0 + 60 (2 bars). Advance 180 seconds → 3 more bars
    // expected, for a total of 5. BAR_STEP_SEC is 60 by construction in
    // mock-backend.ts; this asserts the append cadence without hard-
    // coding the constant.
    const snap = backend.getSnapshot({
      nowSec: T0 + 60 + 180,
      timeframes: { 'FUT-A': '1m' },
    })
    expect(snap.primary.bars.length).toBe(2 + 3)
  })

  it('pulls lastPrice forward to the newest bar close', () => {
    const backend = new MockBackend(seed())
    const snap = backend.getSnapshot({ nowSec: T0 + 60 + 120, timeframes: { 'FUT-A': '1m' } })
    const last = snap.primary.bars[snap.primary.bars.length - 1]
    // The banner reads lastPrice and the chart's right edge reads the
    // last bar close. If they diverge the UI misleads the operator.
    expect(snap.primary.lastPrice).toBe(last.close)
  })

  it('extends each indicator to match the new bar length', () => {
    const backend = new MockBackend(seed())
    const snap = backend.getSnapshot({ nowSec: T0 + 60 + 120, timeframes: { 'FUT-A': '1m' } })
    const { primary } = snap
    // EMA lines must cover the same range as the candles or the chart
    // draws a truncated overlay that lies about the indicator value on
    // the newest bars.
    for (const indicator of primary.indicators) {
      expect(indicator.points.length).toBe(primary.bars.length)
    }
  })

  it('does not append bars when elapsed time is below one step', () => {
    const backend = new MockBackend(seed())
    const snap = backend.getSnapshot({
      nowSec: T0 + 60 + 30,
      timeframes: { 'FUT-A': '1m' },
    })
    // 30 s into the next step → still only 2 bars. The mock must not
    // emit partial bars; the engine contract is that bars are finalized.
    expect(snap.primary.bars.length).toBe(2)
  })

  it('projects the requested primarySymbol as primary and excludes it from watchlist', () => {
    // ADR 004 swap mechanics: a snapshot request carries the symbol
    // the dashboard is currently focused on. The backend re-projects
    // the same universe so that symbol is the heavy primary payload
    // and every *other* tracked instrument appears as a light
    // WatchlistItem. The active primary is never duplicated in the
    // watchlist (layout contract).
    const backend = new MockBackend(seed([futARow(), futBRow()]))

    const snapA = backend.getSnapshot({
      nowSec: T0 + 60,
      primarySymbol: 'FUT-A',
    })
    expect(snapA.primary.instrument.symbol).toBe('FUT-A')
    expect(snapA.watchlist.map((w) => w.instrument.symbol)).toEqual(['FUT-B'])

    const snapB = backend.getSnapshot({
      nowSec: T0 + 60,
      primarySymbol: 'FUT-B',
    })
    expect(snapB.primary.instrument.symbol).toBe('FUT-B')
    expect(snapB.watchlist.map((w) => w.instrument.symbol)).toEqual(['FUT-A'])
  })

  it('falls back to the seed default primary when primarySymbol is omitted', () => {
    // Initial page load (before the user has clicked anything) relies
    // on this default — the Dashboard component boots without a
    // primarySymbol, and the backend must pick a sensible one.
    const backend = new MockBackend(seed([futARow(), futBRow()]))
    const snap = backend.getSnapshot({ nowSec: T0 + 60 })
    expect(snap.primary.instrument.symbol).toBe('FUT-A')
  })

  it('carries the seed pctChange through onto watchlist items', () => {
    // pctChange is the widget's "today's story" signal. Backend reads
    // it from the seed (in real life: the engine) and the projection
    // must not drop or mutate it.
    const backend = new MockBackend({
      ...seed([futARow(), futBRow()]),
      pctChanges: { 'FUT-A': 1.23, 'FUT-B': -0.45 },
    })
    const snap = backend.getSnapshot({
      nowSec: T0 + 60,
      primarySymbol: 'FUT-A',
    })
    const futB = snap.watchlist.find((w) => w.instrument.symbol === 'FUT-B')
    expect(futB?.pctChange).toBe(-0.45)
  })
})
