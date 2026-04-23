import type { Bar, DashboardPayload } from '../dashboard-types'

// Deterministic dashboard scenarios for the mock-first UI build (ADR 004
// development providers strategy). Each scenario is a fully-formed
// DashboardPayload; the UI renders against these until the backend
// MarketDataProvider / SetupEngine / RuleOverlay pipeline is wired up.
//
// All symbols and setup names here are intentionally generic
// placeholders — no references to real instruments or the operator's
// tracked universe (CLAUDE.md privacy rule).

function seededRandom(seed: number): () => number {
  // Linear congruential generator (Numerical Recipes constants).
  // Used for deterministic mock data only — never for anything that
  // resembles real randomness.
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function round(n: number, tickSize: number): number {
  const ticks = Math.round(n / tickSize)
  return Math.round(ticks * tickSize * 100) / 100
}

function generateBars(
  seed: number,
  count: number,
  centerPrice: number,
  lastPrice: number,
  volatility: number,
  tickSize: number,
  endTimeSec: number,
  stepSec: number,
): Bar[] {
  const rand = seededRandom(seed)
  const bars: Bar[] = []
  const startTime = endTimeSec - (count - 1) * stepSec
  let price = centerPrice + (rand() - 0.5) * volatility * 2
  for (let i = 0; i < count; i++) {
    const open = price
    const close = open + (rand() - 0.5) * volatility * 2
    const high = Math.max(open, close) + rand() * volatility
    const low = Math.min(open, close) - rand() * volatility
    bars.push({
      time: startTime + i * stepSec,
      open: round(open, tickSize),
      high: round(high, tickSize),
      low: round(low, tickSize),
      close: round(close, tickSize),
    })
    price = close
  }
  // Pin the last bar's close to lastPrice so the chart's right edge
  // agrees with the row's numeric display. Extend high / low if
  // necessary to keep the bar consistent.
  const last = bars[bars.length - 1]
  last.close = lastPrice
  last.high = Math.max(last.high, lastPrice)
  last.low = Math.min(last.low, lastPrice)
  return bars
}

const END_TIME_SEC = Math.floor(new Date('2026-04-23T09:45:00Z').getTime() / 1000)
const BAR_COUNT = 60
const BAR_STEP_SEC = 60

function intradayPnlCurve(): { t: string; pnl: number }[] {
  // 5-min buckets across a 6-hour session. Values are hand-authored to
  // produce a realistic-looking drawdown-then-partial-recovery shape.
  const buckets = [
    0, 150, 320, 410, 280, 90, -120, -380, -620, -910, -1180, -1320,
    -1450, -1510, -1420, -1360, -1240, -1180, -1100, -1080, -1120, -1060,
    -980, -930,
  ]
  const start = 9 * 60
  return buckets.map((pnl, i) => {
    const mins = start + i * 15
    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    return { t: `${hh}:${mm}`, pnl }
  })
}

export const dashboardDefault: DashboardPayload = {
  sessionPhase: 'open',
  nextMacroEvent: {
    eventName: 'Macro release A',
    impactTier: 'high',
    at: '2026-04-23T13:30:00Z',
  },
  intradayPnl: intradayPnlCurve(),
  rule: {
    used: 930,
    cap: 2000,
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
      state: 'ENTER',
      setup: {
        setupName: 'Opening range break',
        side: 'long',
        target: { price: 17_620.5, label: '+2R' },
        retreat: { price: 17_548.75, label: 'stop' },
        rMultiple: 0.4,
      },
      lastPrice: 17_582.25,
      lastPriceAt: '2026-04-23T09:45:00Z',
      macro: null,
      bars: generateBars(
        1337,
        BAR_COUNT,
        17_570,
        17_582.25,
        6,
        0.25,
        END_TIME_SEC,
        BAR_STEP_SEC,
      ),
    },
    {
      instrument: {
        symbol: 'FUT-B',
        displayName: 'Mock Future B',
        tickSize: 0.5,
        tickValue: 10,
        quoteCurrency: 'USD',
      },
      state: 'HOLD',
      setup: {
        setupName: 'VWAP reclaim',
        side: 'short',
        target: { price: 4_812.0, label: '+1.5R' },
        retreat: { price: 4_847.5, label: 'invalidation' },
        rMultiple: 0,
      },
      lastPrice: 4_829.75,
      lastPriceAt: '2026-04-23T09:45:00Z',
      macro: null,
      bars: generateBars(
        4242,
        BAR_COUNT,
        4_830,
        4_829.75,
        2.5,
        0.5,
        END_TIME_SEC,
        BAR_STEP_SEC,
      ),
    },
  ],
}

export const dashboardScenarios = {
  default: dashboardDefault,
} as const

export type DashboardScenarioName = keyof typeof dashboardScenarios
