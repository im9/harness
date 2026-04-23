import type {
  Bar,
  DashboardPayload,
  IndicatorLine,
  IndicatorPoint,
} from '../dashboard-types'

// Deterministic dashboard scenarios for the mock-first UI build (ADR 004
// development providers strategy). Each scenario is a fully-formed
// DashboardPayload; the UI renders against these until the backend
// MarketDataProvider / SetupEngine / RuleOverlay pipeline is wired up.
//
// All symbols and setup names here are intentionally generic
// placeholders — no references to real instruments or the operator's
// tracked universe (CLAUDE.md privacy rule).

export function seededRandom(seed: number): () => number {
  // Linear congruential generator (Numerical Recipes constants).
  // Used for deterministic mock data only — never for anything that
  // resembles real randomness.
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

export function round(n: number, tickSize: number): number {
  const ticks = Math.round(n / tickSize)
  return Math.round(ticks * tickSize * 100) / 100
}

export function generateBars(
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

export function computeEma(bars: Bar[], period: number): IndicatorPoint[] {
  // Standard EMA recurrence: EMA_t = close_t * k + EMA_{t-1} * (1 - k)
  // with smoothing factor k = 2 / (period + 1). Seeded with the first
  // close — acceptable for display; a backtest-grade engine would seed
  // with the SMA of the first `period` closes instead.
  if (bars.length === 0) return []
  const k = 2 / (period + 1)
  let ema = bars[0].close
  return bars.map((bar) => {
    ema = bar.close * k + ema * (1 - k)
    return { time: bar.time, value: Math.round(ema * 100) / 100 }
  })
}

export function emaPair(bars: Bar[]): IndicatorLine[] {
  return [
    { name: 'EMA20', kind: 'ema', points: computeEma(bars, 20) },
    { name: 'EMA50', kind: 'ema', points: computeEma(bars, 50) },
  ]
}

// End the bar history at *now* so the initial chart is anchored to the
// operator's wall clock. Without this, a fixed fixture date leaves the
// dashboard looking frozen (either no bars appended when wall < fixture
// time, or a huge backfill followed by a stall when wall > fixture time).
// Re-evaluated at module load, which happens once per browser session.
const END_TIME_SEC = Math.floor(Date.now() / 1000)
// Demo cadence, not a realism claim: 10 s / bar makes chart movement
// readable during a short manual session. Swap to 60 (one-minute bars)
// when we start benchmarking against real vendor feeds.
const BAR_COUNT = 120
const BAR_STEP_SEC = 10
const END_ISO = new Date(END_TIME_SEC * 1000).toISOString()
const NEXT_EVENT_ISO = new Date((END_TIME_SEC + 3 * 60 * 60) * 1000).toISOString()

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

const FUT_A_BARS = generateBars(
  1337,
  BAR_COUNT,
  17_570,
  17_582.25,
  6,
  0.25,
  END_TIME_SEC,
  BAR_STEP_SEC,
)

const FUT_B_BARS = generateBars(
  4242,
  BAR_COUNT,
  4_830,
  4_829.75,
  2.5,
  0.5,
  END_TIME_SEC,
  BAR_STEP_SEC,
)

export const dashboardDefault: DashboardPayload = {
  sessionPhase: 'open',
  nextMacroEvent: {
    eventName: 'Macro release A',
    impactTier: 'high',
    at: NEXT_EVENT_ISO,
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
      lastPriceAt: END_ISO,
      macro: null,
      bars: FUT_A_BARS,
      indicators: emaPair(FUT_A_BARS),
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
      lastPriceAt: END_ISO,
      macro: null,
      bars: FUT_B_BARS,
      indicators: emaPair(FUT_B_BARS),
    },
  ],
}

export const dashboardScenarios = {
  default: dashboardDefault,
} as const

export type DashboardScenarioName = keyof typeof dashboardScenarios
