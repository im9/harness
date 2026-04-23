import type {
  Bar,
  DashboardPayload,
  IndicatorLine,
  IndicatorPoint,
  Instrument,
  InstrumentRowState,
  MacroEventWindow,
  MarketIndex,
  NewsItem,
  RuleOverlayState,
  SetupContext,
  SparklinePoint,
  WatchlistItem,
} from '../dashboard-types'

// Mock data for the ADR 004 dashboard. The mock paints a plausible
// Tokyo-session-on-a-Nikkei-mini-primary scene: realistic prices,
// session-appropriate pctChanges, setups the engine would actually
// evaluate. Placeholder instruments (FUT-A, etc.) were removed — per
// ADR 004 §Configuration boundary, public market identifiers are
// permitted in fixtures, and the operator-specific layer (chosen
// subset, thresholds, vendors) is what must stay in the DB / .env.
//
// The mock exposes three layers:
//
// 1. `dashboardUniverse` — the full InstrumentRowState for every
//    tracked instrument. Any member can be promoted to primary.
// 2. `pctChangeOf` / `dashboardCommon` — per-instrument pctChange
//    numbers and the cross-cutting data (rule state, intraday P&L,
//    news, session phase, next macro event).
// 3. `projectDashboard(primarySymbol?)` — projects the universe plus
//    common data into a DashboardPayload with the requested symbol
//    as the heavy `primary` and every *other* tracked instrument as
//    a light `WatchlistItem` (ADR 004 layout contract — active
//    primary is never duplicated in the watchlist).

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

function tickSizeDecimals(tickSize: number): number {
  // Derive the number of significant decimals from the tick size so
  // `round` preserves precision for sub-cent ticks (USD/JPY at 0.001)
  // without hard-coding a `* 100 / 100` that would silently drop the
  // third decimal. String-parse is fine here: tickSize is a payload
  // configuration value, not a hot-path arithmetic operand.
  const str = tickSize.toString()
  const dot = str.indexOf('.')
  if (dot === -1) return 0
  return str.length - dot - 1
}

export function round(n: number, tickSize: number): number {
  const ticks = Math.round(n / tickSize)
  const raw = ticks * tickSize
  const decimals = tickSizeDecimals(tickSize)
  const factor = Math.pow(10, decimals)
  return Math.round(raw * factor) / factor
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
    // Volume is loosely correlated with the bar's range — wider bars
    // usually carry more contracts in real markets, and mirroring that
    // here keeps the histogram reading like a "confirmation" signal
    // rather than pure noise. Base 400 + range-proportional scale +
    // uniform jitter. Rounded to integers since contracts are discrete.
    const range = Math.max(high - low, tickSize)
    const volume = Math.round(400 + range * 80 + rand() * 300)
    bars.push({
      time: startTime + i * stepSec,
      open: round(open, tickSize),
      high: round(high, tickSize),
      low: round(low, tickSize),
      close: round(close, tickSize),
      volume,
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
    return { time: bar.time, value: Math.round(ema * 1e4) / 1e4 }
  })
}

export function emaPair(bars: Bar[]): IndicatorLine[] {
  return [
    { name: 'EMA20', kind: 'ema', points: computeEma(bars, 20) },
    { name: 'EMA50', kind: 'ema', points: computeEma(bars, 50) },
  ]
}

export function computeVwap(bars: Bar[]): IndicatorPoint[] {
  // Proper volume-weighted VWAP: Σ(typical × volume) / Σ(volume).
  // Mock bars now carry volume so the indicator agrees with whatever
  // setup reads it (e.g. "VWAP reclaim"). A real vendor adapter will
  // supply session-anchored values; this streams from the first bar.
  let num = 0
  let den = 0
  return bars.map((bar) => {
    const typical = (bar.high + bar.low + bar.close) / 3
    num += typical * bar.volume
    den += bar.volume
    const value = den === 0 ? typical : num / den
    return { time: bar.time, value: Math.round(value * 1e4) / 1e4 }
  })
}

// Sparkline fidelity for the Watchlist widget. 40 points is enough to
// read a shape at a glance without overwhelming the ~100 px mini-row
// width; fewer points render as a jagged line, more points pack
// visually into noise.
const SPARKLINE_POINTS = 40

export function sparklineFromBars(bars: Bar[]): SparklinePoint[] {
  const slice = bars.slice(-SPARKLINE_POINTS)
  return slice.map((bar) => ({ time: bar.time, value: bar.close }))
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

// Active macro window centered on the current wall clock — half the
// window sits in-frame, half just-before. Exists so the mock dashboard
// demonstrates the vertical band overlay without needing the operator
// to wait for a scheduled release to land.
const MACRO_WINDOW_HALF_SEC = 3 * 60
const MACRO_START_ISO = new Date(
  (END_TIME_SEC - MACRO_WINDOW_HALF_SEC) * 1000,
).toISOString()
const MACRO_END_ISO = new Date(
  (END_TIME_SEC + MACRO_WINDOW_HALF_SEC) * 1000,
).toISOString()

// --- Per-instrument definitions ---------------------------------------

// Nikkei 225 Mini: OSE, 5 index points / tick, ¥100 / index point → ¥500 / tick.
// The most commonly day-traded Japan equity-index futures variant; ADR
// 004 names it the bootstrap primary target.
const NKM_INSTRUMENT: Instrument = {
  symbol: 'NKM',
  displayName: 'Nikkei 225 Mini',
  tickSize: 5,
  tickValue: 500,
  quoteCurrency: 'JPY',
}
const NKM_BARS = generateBars(
  1337,
  BAR_COUNT,
  38_500,
  38_515,
  25,
  NKM_INSTRUMENT.tickSize,
  END_TIME_SEC,
  BAR_STEP_SEC,
)
const NKM_SETUP: SetupContext = {
  setupName: 'Opening range break',
  side: 'long',
  target: { price: 38_655, label: '+2R' },
  retreat: { price: 38_445, label: 'stop' },
  rMultiple: 0.5,
  setupRange: {
    upper: { price: 38_550, label: 'ORH' },
    lower: { price: 38_480, label: 'ORL' },
    midline: { price: 38_515, label: 'OR mid' },
  },
}
const NKM_MACRO: MacroEventWindow = {
  eventName: 'BOJ press conference',
  impactTier: 'high',
  phase: 'event',
  startsAt: MACRO_START_ISO,
  endsAt: MACRO_END_ISO,
}
const NKM_ROW: InstrumentRowState = {
  instrument: NKM_INSTRUMENT,
  state: 'ENTER',
  setup: NKM_SETUP,
  lastPrice: 38_515,
  lastPriceAt: END_ISO,
  macro: NKM_MACRO,
  bars: NKM_BARS,
  indicators: [
    ...emaPair(NKM_BARS),
    { name: 'VWAP', kind: 'vwap', points: computeVwap(NKM_BARS) },
  ],
}

// TOPIX Mini: OSE, 0.25 index points / tick, ¥1000 / index point → ¥250 / tick.
// Sits alongside Nikkei in the watchlist so the operator can spot
// divergence (narrow-rally = top-heavy Nikkei without TOPIX follow-through).
const TPXM_INSTRUMENT: Instrument = {
  symbol: 'TPXM',
  displayName: 'TOPIX Mini',
  tickSize: 0.25,
  tickValue: 250,
  quoteCurrency: 'JPY',
}
const TPXM_BARS = generateBars(
  4242,
  BAR_COUNT,
  2_810,
  2_812.5,
  1.5,
  TPXM_INSTRUMENT.tickSize,
  END_TIME_SEC,
  BAR_STEP_SEC,
)
const TPXM_SETUP: SetupContext = {
  setupName: 'VWAP reclaim',
  side: 'short',
  target: { price: 2_790, label: '+1.5R' },
  retreat: { price: 2_825, label: 'invalidation' },
  rMultiple: 0,
  setupRange: null,
}
const TPXM_ROW: InstrumentRowState = {
  instrument: TPXM_INSTRUMENT,
  state: 'HOLD',
  setup: TPXM_SETUP,
  lastPrice: 2_812.5,
  lastPriceAt: END_ISO,
  macro: null,
  bars: TPXM_BARS,
  indicators: [
    ...emaPair(TPXM_BARS),
    { name: 'VWAP', kind: 'vwap', points: computeVwap(TPXM_BARS) },
  ],
}

// USD/JPY spot: 0.001 / tick quote. The classic leading indicator for
// Japan-equity direction — yen-weaker typically supports Nikkei. Having
// it in the same watchlist as Nikkei mini is the concrete example ADR
// 004 uses for "no single-asset-class constraint".
const USDJPY_INSTRUMENT: Instrument = {
  symbol: 'USDJPY',
  displayName: 'USD/JPY',
  tickSize: 0.001,
  tickValue: 1,
  quoteCurrency: 'JPY',
}
const USDJPY_BARS = generateBars(
  9001,
  BAR_COUNT,
  155.4,
  155.418,
  0.04,
  USDJPY_INSTRUMENT.tickSize,
  END_TIME_SEC,
  BAR_STEP_SEC,
)
const USDJPY_SETUP: SetupContext = {
  setupName: 'Asian range break',
  side: 'long',
  target: { price: 155.65, label: '+2R' },
  retreat: { price: 155.3, label: 'stop' },
  rMultiple: 0.3,
  setupRange: {
    upper: { price: 155.45, label: 'AR high' },
    lower: { price: 155.35, label: 'AR low' },
    midline: { price: 155.4, label: 'AR mid' },
  },
}
const USDJPY_ROW: InstrumentRowState = {
  instrument: USDJPY_INSTRUMENT,
  state: 'ENTER',
  setup: USDJPY_SETUP,
  lastPrice: 155.418,
  lastPriceAt: END_ISO,
  macro: null,
  bars: USDJPY_BARS,
  indicators: [
    ...emaPair(USDJPY_BARS),
    { name: 'VWAP', kind: 'vwap', points: computeVwap(USDJPY_BARS) },
  ],
}

// S&P 500 E-mini: CME, 0.25 / tick, $12.50 / tick. Overnight-driver
// context for a Japan-session Nikkei primary — weak ES pre-Tokyo tends
// to drag the open. Different asset class (US index futures) but kept
// in the same watchlist (ADR 004 cross-asset OK).
const ES_INSTRUMENT: Instrument = {
  symbol: 'ES',
  displayName: 'S&P 500 E-mini',
  tickSize: 0.25,
  tickValue: 12.5,
  quoteCurrency: 'USD',
}
const ES_BARS = generateBars(
  1717,
  BAR_COUNT,
  5_710,
  5_712.25,
  1.2,
  ES_INSTRUMENT.tickSize,
  END_TIME_SEC,
  BAR_STEP_SEC,
)
const ES_SETUP: SetupContext = {
  setupName: 'Globex breakout',
  side: 'long',
  target: { price: 5_730.0, label: '+2R' },
  retreat: { price: 5_703.0, label: 'stop' },
  rMultiple: 0,
  setupRange: null,
}
const ES_ROW: InstrumentRowState = {
  instrument: ES_INSTRUMENT,
  state: 'HOLD',
  setup: ES_SETUP,
  lastPrice: 5_712.25,
  lastPriceAt: END_ISO,
  macro: null,
  bars: ES_BARS,
  indicators: [
    ...emaPair(ES_BARS),
    { name: 'VWAP', kind: 'vwap', points: computeVwap(ES_BARS) },
  ],
}

// --- Universe + common data + projection ------------------------------

export const dashboardUniverse: InstrumentRowState[] = [
  NKM_ROW,
  TPXM_ROW,
  USDJPY_ROW,
  ES_ROW,
]

// pctChange values plausible for a Tokyo morning with a yen-weakening
// undertone: Nikkei and TOPIX up with USD/JPY up (yen weaker →
// exporters bid), ES slightly red from overnight carry. These mirror
// the "agreement check" the widget is designed for — the operator on
// a Nikkei long sees two supporting signals and one warning.
export const pctChangeOf: Record<string, number> = {
  NKM: 0.42,
  TPXM: 0.28,
  USDJPY: 0.41,
  ES: -0.15,
}

const RULE_STATE: RuleOverlayState = {
  used: 930,
  cap: 2000,
  capReached: false,
  cooldownActive: false,
  cooldownUntil: null,
  quoteCurrency: 'JPY',
}

// Top-strip benchmark indices (ADR 004 Markets overview). Cash indices,
// not tradeable — `MarketIndex` is structurally separate from
// `Instrument`. Prices and pctChanges are hand-picked to be consistent
// with the watchlist scene: NKM future aligns with N225 cash, ES
// future aligns with SPX cash, USDJPY here matches the FX cross in the
// watchlist. Small divergences between futures and cash mimic normal
// basis drift rather than revealing a bug.
const MARKET_INDICES: MarketIndex[] = [
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
    ticker: 'NDX',
    displayName: 'Nasdaq 100',
    lastPrice: 20_420,
    pctChange: 0.18,
  },
  {
    ticker: 'SPX',
    displayName: 'S&P 500',
    lastPrice: 5_715,
    pctChange: -0.12,
  },
  {
    ticker: 'USDJPY',
    displayName: 'USD/JPY',
    lastPrice: 155.42,
    pctChange: 0.41,
  },
]

const NEWS_ITEMS: NewsItem[] = [
  // Hand-authored headlines that read like a wire feed, pinned to
  // offsets from END_TIME_SEC so the list always looks recent. Fully
  // fictional — no real sources, no operator-specific positioning.
  {
    id: 'news-1',
    title: 'BOJ governor hints at cautious tightening in afternoon remarks',
    impactTier: 'high',
    at: new Date((END_TIME_SEC - 2 * 60) * 1000).toISOString(),
  },
  {
    id: 'news-2',
    title: 'US crude stockpiles fall sharply, beating consensus',
    impactTier: 'medium',
    at: new Date((END_TIME_SEC - 14 * 60) * 1000).toISOString(),
  },
  {
    id: 'news-3',
    title: 'European equities open mixed ahead of ECB commentary',
    impactTier: 'low',
    at: new Date((END_TIME_SEC - 35 * 60) * 1000).toISOString(),
  },
  {
    id: 'news-4',
    title: 'US 10Y yields edge lower on softer economic data',
    impactTier: 'medium',
    at: new Date((END_TIME_SEC - 72 * 60) * 1000).toISOString(),
  },
]

export interface DashboardCommon {
  rule: RuleOverlayState
  markets: MarketIndex[]
  news: NewsItem[]
}

export const dashboardCommon: DashboardCommon = {
  rule: RULE_STATE,
  markets: MARKET_INDICES,
  news: NEWS_ITEMS,
}

export const DEFAULT_PRIMARY_SYMBOL = 'NKM'

function toWatchlistItem(
  row: InstrumentRowState,
  pctChange: number,
): WatchlistItem {
  return {
    instrument: row.instrument,
    state: row.state,
    lastPrice: row.lastPrice,
    lastPriceAt: row.lastPriceAt,
    pctChange,
    sparkline: sparklineFromBars(row.bars),
  }
}

// Re-project the universe into a `DashboardPayload` with the requested
// instrument as the heavy primary. Active primary is excluded from the
// watchlist (ADR 004 contract). Defaults to `DEFAULT_PRIMARY_SYMBOL`
// when the caller does not specify — handy for the initial page load
// before the operator has swapped anything.
export function projectDashboard(
  primarySymbol: string = DEFAULT_PRIMARY_SYMBOL,
  universe: InstrumentRowState[] = dashboardUniverse,
  pctChanges: Record<string, number> = pctChangeOf,
  common: DashboardCommon = dashboardCommon,
): DashboardPayload {
  const primary =
    universe.find((row) => row.instrument.symbol === primarySymbol) ??
    universe[0]
  const watchlist = universe
    .filter((row) => row.instrument.symbol !== primary.instrument.symbol)
    .map((row) => toWatchlistItem(row, pctChanges[row.instrument.symbol] ?? 0))
  return {
    rule: common.rule,
    markets: common.markets,
    primary,
    watchlist,
    news: common.news,
  }
}

export const dashboardDefault: DashboardPayload = projectDashboard()

export const dashboardScenarios = {
  default: dashboardDefault,
} as const

export type DashboardScenarioName = keyof typeof dashboardScenarios
