// Dashboard payload contract (ADR 004).
//
// Frontend-side mirror of the future `GET /api/dashboard` /
// `WebSocket /ws/dashboard` response shape. Kept in TypeScript now so
// the mock-first UI build locks the contract before the backend is
// wired up. The backend Pydantic models must stay structurally
// compatible with these types.

export type RecommendationState = 'ENTER' | 'HOLD' | 'EXIT' | 'RETREAT'

export type Side = 'long' | 'short'

export type SessionPhase = 'pre_open' | 'open' | 'lunch' | 'close' | 'after_hours'

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

export interface PnlPoint {
  t: string
  pnl: number
}

export interface NextMacroEvent {
  eventName: string
  impactTier: ImpactTier
  at: string
}

export interface DashboardPayload {
  sessionPhase: SessionPhase
  nextMacroEvent: NextMacroEvent | null
  intradayPnl: PnlPoint[]
  rule: RuleOverlayState
  rows: InstrumentRowState[]
}
