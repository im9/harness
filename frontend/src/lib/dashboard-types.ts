// Dashboard payload contract (ADR 004).
//
// Frontend-side mirror of the future `GET /api/dashboard` /
// `WebSocket /ws/dashboard` response shape. Kept in TypeScript now so
// the mock-first UI build locks the contract before the backend is
// wired up. The backend Pydantic models must stay structurally
// compatible with these types.

export type RecommendationState = 'ENTER' | 'HOLD' | 'EXIT' | 'RETREAT'

export type Side = 'long' | 'short'

export type ImpactTier = 'low' | 'medium' | 'high'

// Chart timeframes. Wire-friendly string literals so the frontend and
// the eventual backend (ADR 004 provider adapters) agree on the same
// vocabulary without a translation table. `10s` is retained as the
// mock's demo-live cadence; longer timeframes are what operators
// typically configure for live trading.
export type Timeframe = '10s' | '1m' | '5m' | '15m' | '1h' | '1d' | '1w'

export const TIMEFRAMES: readonly Timeframe[] = [
  '10s',
  '1m',
  '5m',
  '15m',
  '1h',
  '1d',
  '1w',
] as const

export const TIMEFRAME_SEC: Record<Timeframe, number> = {
  '10s': 10,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '1d': 86_400,
  '1w': 604_800,
}

export interface Instrument {
  symbol: string
  displayName: string
  // Trading venue / exchange where the instrument is listed (OSE,
  // CME, TSE, OTC, ...). Printed in the state banner's sub-line
  // alongside the ticker so the operator sees the full identity of
  // the focused instrument at a glance — particularly relevant when
  // the watchlist mixes asset classes across venues.
  venue: string
  tickSize: number
  tickValue: number
  quoteCurrency: string
}

export interface PriceLevel {
  price: number
  label: string
}

// Bounded horizontal region meaningful to a setup — opening range,
// consolidation, value area, prior-day high/low. `midline` is
// optional because not every range has a natural mid anchor (ORs do;
// some consolidations don't). Dynamic bands (Bollinger, VWAP±σ,
// Keltner, ATR channel) live in the indicator pipeline, not here —
// see ADR 004 Future extensions.
export interface SetupRange {
  upper: PriceLevel
  lower: PriceLevel
  midline?: PriceLevel
}

export interface SetupContext {
  setupName: string
  side: Side
  target: PriceLevel
  retreat: PriceLevel
  rMultiple: number
  setupRange: SetupRange | null
}

export interface MacroEventWindow {
  eventName: string
  impactTier: ImpactTier
  phase: 'pre' | 'event' | 'post'
  startsAt: string
  endsAt: string
}

export interface RuleOverlayState {
  used: number
  cap: number
  capReached: boolean
  cooldownActive: boolean
  cooldownUntil: string | null
  quoteCurrency: string
}

export interface Bar {
  // UTC seconds since epoch. lightweight-charts accepts this shape
  // directly via its `UTCTimestamp` time type.
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// Indicator values travel in the payload rather than being recomputed
// on the client so the chart agrees with whatever the backend setup
// engine / rule overlay is reading (e.g. a "VWAP reclaim" setup must
// use the same VWAP the chart renders).
export type IndicatorKind = 'ema' | 'sma' | 'vwap' | 'line'

export interface IndicatorPoint {
  time: number
  value: number
}

export interface IndicatorLine {
  name: string
  kind: IndicatorKind
  points: IndicatorPoint[]
}

export interface InstrumentRowState {
  instrument: Instrument
  state: RecommendationState
  setup: SetupContext | null
  lastPrice: number
  lastPriceAt: string
  macro: MacroEventWindow | null
  bars: Bar[]
  indicators: IndicatorLine[]
}

// Minimal context-only shape for secondary instruments in the right-
// column Watchlist widget. Intentionally lighter than
// `InstrumentRowState`: no bars, no indicators, no setup — just enough
// to render a state badge, a last price, and a sparkline. The widget
// is a context surface, not a decision unit (ADR 004 Dashboard
// layout), so the heavier chart pipeline would be wasted on it.
export interface SparklinePoint {
  // UTC seconds since epoch — same time base as `Bar.time` so the
  // sparkline can interleave with primary-panel data if needed.
  time: number
  value: number
}

export interface WatchlistItem {
  instrument: Instrument
  state: RecommendationState
  lastPrice: number
  lastPriceAt: string
  // Percent change from the instrument's session anchor (per-instrument
  // choice on the backend — JP equities anchor to the morning open,
  // USD/JPY to the prior NY close, US index futures to the prior
  // settle). The frontend displays this as +X.XX% / -X.XX% with
  // sign-driven color; it is the primary "today's story" readout for a
  // mini row and drives the agreement-check glance the widget exists
  // for. Payload carries a pre-computed number so the chart and the
  // engine agree on the same anchor.
  pctChange: number
  sparkline: SparklinePoint[]
}

// Streamed headline shown in the right-column NewsFeed. Source /
// body / URL are what the operator actually needs to act on a
// headline — they were deferred to Future extensions in earlier
// drafts but have been pulled into Phase 1 because "tag + time +
// title" alone doesn't earn the widget's real estate (the operator
// can't tell what actually happened, only that something of the
// given impact did). All three are optional so mock scenarios and
// future provider adapters can populate them progressively; the
// NewsFeed renders inline expansion only when at least one detail
// field is present.
export interface NewsItem {
  id: string
  title: string
  impactTier: ImpactTier
  at: string
  source?: string
  body?: string
  url?: string
}

// Cash benchmark index rendered in the top Markets strip (ADR 004
// top-strip Markets overview). Structurally distinct from
// `Instrument` — no state, no setup, no bars, no swap: these are
// reference-only readouts that the operator does not trade through
// harness. Keeping them on a separate type prevents accidental
// promotion into watchlist / primary surfaces.
export interface MarketIndex {
  ticker: string
  displayName: string
  lastPrice: number
  pctChange: number
}

export interface DashboardPayload {
  rule: RuleOverlayState
  // Top-strip markets overview (ADR 004). A small, fixed set of
  // global benchmark indices for at-a-glance macro context.
  markets: MarketIndex[]
  // The active primary instrument — the one the dashboard is currently
  // focused on (ADR 004: "primary is a view mode, not a fixed
  // property"). The engine tracks state for every operator-configured
  // instrument; `primary` is simply whichever one has the hero chart
  // right now. Swapping the primary re-projects the payload.
  primary: InstrumentRowState
  // Every *other* tracked instrument. The active primary is NEVER
  // present here — the two surfaces never duplicate the same
  // instrument (ADR 004 layout contract). Clicking a watchlist item
  // promotes it to primary; the displaced primary slides back into
  // this array.
  watchlist: WatchlistItem[]
  news: NewsItem[]
}
