import { describe, expect, it } from 'vitest'
import { dashboardDefault, dashboardScenarios } from './dashboard'

const VALID_STATES = ['ENTER', 'HOLD', 'EXIT', 'RETREAT']
const VALID_PHASES = ['pre_open', 'open', 'lunch', 'close', 'after_hours']

describe('dashboard mocks', () => {
  it('default scenario carries at least one instrument row', () => {
    // The dashboard layout is defined as one row per tracked instrument
    // (ADR 004 Layout section). A zero-row payload would render an empty
    // page and mask regressions in the per-row components. Keep at least
    // one row so smoke tests against the default scenario remain meaningful.
    expect(dashboardDefault.rows.length).toBeGreaterThanOrEqual(1)
  })

  it('every row state is one of the four ADR-004 recommendation values', () => {
    for (const row of dashboardDefault.rows) {
      expect(VALID_STATES).toContain(row.state)
    }
  })

  it('session phase is one of the declared SessionPhase values', () => {
    expect(VALID_PHASES).toContain(dashboardDefault.sessionPhase)
  })

  it('rule state reports used ≤ cap when cap has not been reached', () => {
    // capReached is the engine's authoritative signal; the used / cap
    // pair is a human-readable projection. When capReached is false, the
    // invariant used ≤ cap must hold so the gauge never renders > 100 %
    // full while reporting a non-capped state.
    if (!dashboardDefault.rule.capReached) {
      expect(dashboardDefault.rule.used).toBeLessThanOrEqual(dashboardDefault.rule.cap)
    }
  })

  it('exposes every scenario through the scenarios index', () => {
    // The scenarios map is how the mock-mode selector in the Settings UI
    // will enumerate choices. Each scenario should appear there, not
    // just as a loose export.
    expect(dashboardScenarios.default).toBe(dashboardDefault)
  })

  it('every row carries a non-empty bar history with consistent OHLC', () => {
    // The dashboard chart (ADR 004 layout) needs bars to render. A zero-
    // length bars array would leave the chart pane blank and hide
    // regressions in the PriceChart pipeline. OHLC consistency
    // (low ≤ open,close ≤ high) is the minimum shape a candle renderer
    // assumes; a violation would produce visually broken wicks.
    for (const row of dashboardDefault.rows) {
      expect(row.bars.length).toBeGreaterThan(0)
      for (const bar of row.bars) {
        expect(bar.low).toBeLessThanOrEqual(bar.open)
        expect(bar.low).toBeLessThanOrEqual(bar.close)
        expect(bar.high).toBeGreaterThanOrEqual(bar.open)
        expect(bar.high).toBeGreaterThanOrEqual(bar.close)
      }
    }
  })

  it("anchors each row's last bar close to the row's lastPrice", () => {
    // The status banner shows lastPrice as the "current" quote; the
    // chart's right edge must agree or the two widgets disagree at a
    // glance. The mock pins the final close for this reason.
    for (const row of dashboardDefault.rows) {
      const last = row.bars[row.bars.length - 1]
      expect(last.close).toBe(row.lastPrice)
    }
  })

  it('ships EMA20 and EMA50 indicators aligned to the bar history', () => {
    // Indicator points travel in the payload so the chart renders the
    // same values the engine / overlays read (ADR 004 — "indicators
    // live in the payload"). Length alignment with bars is the minimum
    // guarantee — otherwise the chart would render a ragged overlay
    // where the candles and the EMA disagree at the right edge.
    for (const row of dashboardDefault.rows) {
      const names = row.indicators.map((i) => i.name)
      expect(names).toContain('EMA20')
      expect(names).toContain('EMA50')
      for (const indicator of row.indicators) {
        expect(indicator.points.length).toBe(row.bars.length)
      }
    }
  })
})
