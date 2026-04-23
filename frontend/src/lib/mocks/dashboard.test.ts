import { describe, expect, it } from 'vitest'
import { dashboardDefault, dashboardScenarios } from './dashboard'

const VALID_STATES = ['ENTER', 'HOLD', 'EXIT', 'RETREAT']
const VALID_PHASES = ['pre_open', 'open', 'lunch', 'close', 'after_hours']
const VALID_IMPACTS = ['low', 'medium', 'high']

describe('dashboard mocks', () => {
  it('default scenario has a primary instrument', () => {
    // Phase 1 centers on a single primary (ADR 004). A missing primary
    // would leave the dashboard's left column blank and mask regressions
    // in PrimaryInstrumentPanel.
    expect(dashboardDefault.primary).toBeDefined()
    expect(dashboardDefault.primary.instrument.symbol).toBeTruthy()
  })

  it('primary state is one of the four ADR-004 recommendation values', () => {
    expect(VALID_STATES).toContain(dashboardDefault.primary.state)
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

  it('primary carries a non-empty bar history with consistent OHLC', () => {
    // The primary chart (ADR 004 layout) needs bars to render. A zero-
    // length bars array would leave the chart pane blank and hide
    // regressions in the PriceChart pipeline. OHLC consistency
    // (low ≤ open,close ≤ high) is the minimum shape a candle renderer
    // assumes; a violation would produce visually broken wicks.
    const { primary } = dashboardDefault
    expect(primary.bars.length).toBeGreaterThan(0)
    for (const bar of primary.bars) {
      expect(bar.low).toBeLessThanOrEqual(bar.open)
      expect(bar.low).toBeLessThanOrEqual(bar.close)
      expect(bar.high).toBeGreaterThanOrEqual(bar.open)
      expect(bar.high).toBeGreaterThanOrEqual(bar.close)
    }
  })

  it("anchors the primary's last bar close to its lastPrice", () => {
    // The status banner shows lastPrice as the "current" quote; the
    // chart's right edge must agree or the two widgets disagree at a
    // glance. The mock pins the final close for this reason.
    const { primary } = dashboardDefault
    const last = primary.bars[primary.bars.length - 1]
    expect(last.close).toBe(primary.lastPrice)
  })

  it('ships EMA20 and EMA50 indicators aligned to the primary bars', () => {
    // Indicator points travel in the payload so the chart renders the
    // same values the engine / overlays read (ADR 004 — "indicators
    // live in the payload"). Length alignment with bars is the minimum
    // guarantee — otherwise the chart would render a ragged overlay
    // where the candles and the EMA disagree at the right edge.
    const { primary } = dashboardDefault
    const names = primary.indicators.map((i) => i.name)
    expect(names).toContain('EMA20')
    expect(names).toContain('EMA50')
    for (const indicator of primary.indicators) {
      expect(indicator.points.length).toBe(primary.bars.length)
    }
  })

  it('watchlist carries at least one secondary instrument', () => {
    // The right-column widget (ADR 004 Dashboard layout) is meaningless
    // empty. At least one entry keeps the widget's render path exercised
    // against the default scenario.
    expect(dashboardDefault.watchlist.length).toBeGreaterThanOrEqual(1)
  })

  it('every watchlist item has a valid state and a non-empty sparkline', () => {
    // Sparkline is the widget's visual hook — zero points would render a
    // flat or invisible line and hide regressions in the mini-row
    // component.
    for (const item of dashboardDefault.watchlist) {
      expect(VALID_STATES).toContain(item.state)
      expect(item.sparkline.length).toBeGreaterThan(0)
    }
  })

  it('news items carry a valid impact tier', () => {
    // impactTier drives badge color in NewsFeed; an unknown value would
    // silently fall through the color mapping.
    for (const item of dashboardDefault.news) {
      expect(VALID_IMPACTS).toContain(item.impactTier)
    }
  })
})
