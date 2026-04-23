import type { DashboardPayload } from '../dashboard-types'

// Deterministic dashboard scenarios for the mock-first UI build (ADR 004
// development providers strategy). Each scenario is a fully-formed
// DashboardPayload; the UI renders against these until the backend
// MarketDataProvider / SetupEngine / RuleOverlay pipeline is wired up.
//
// All symbols and setup names here are intentionally generic
// placeholders — no references to real instruments or the operator's
// tracked universe (CLAUDE.md privacy rule).

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
    },
  ],
}

export const dashboardScenarios = {
  default: dashboardDefault,
} as const

export type DashboardScenarioName = keyof typeof dashboardScenarios
