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

export interface SetupContext {
  setupName: string
  side: Side
  target: PriceLevel
  retreat: PriceLevel
  rMultiple: number
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
}

export interface InstrumentRowState {
  instrument: Instrument
  state: RecommendationState
  setup: SetupContext | null
  lastPrice: number
  lastPriceAt: string
  macro: MacroEventWindow | null
  bars: Bar[]
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
