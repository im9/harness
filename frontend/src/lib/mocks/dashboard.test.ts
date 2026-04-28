import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRIMARY_SYMBOL,
  dashboardDefault,
  dashboardScenarios,
  dashboardUniverse,
  projectDashboard,
} from './dashboard'

// ADR 007 narrowed the banner state model: 4-state recommendation
// (ENTER/HOLD/EXIT/RETREAT) → 3-state TrendState (up/down/range).
const VALID_STATES = ['up', 'down', 'range']
const VALID_IMPACTS = ['low', 'medium', 'high']

describe('dashboard mocks', () => {
  it('default scenario has a primary instrument', () => {
    // ADR 004: primary is a view mode, not a fixed property. The mock
    // picks whichever instrument `DEFAULT_PRIMARY_SYMBOL` names as the
    // page-load focus; the universe holds all tracked instruments.
    expect(dashboardDefault.primary).toBeDefined()
    expect(dashboardDefault.primary.instrument.symbol).toBe(DEFAULT_PRIMARY_SYMBOL)
  })

  it('tracks multiple instruments in the universe', () => {
    // Swap mechanics (ADR 004) require more than one tracked
    // instrument to be meaningful — a one-item universe would leave
    // the watchlist permanently empty and regressions in the swap
    // handler would never surface.
    expect(dashboardUniverse.length).toBeGreaterThanOrEqual(2)
  })

  it('primary state is one of the three ADR-007 trend values', () => {
    expect(VALID_STATES).toContain(dashboardDefault.primary.state)
  })

  it('ships a non-empty markets overview', () => {
    // The top-strip Markets overview (ADR 004) is the only macro
    // context surface in Phase 1; an empty array would render a bare
    // top strip with nothing to read, masking regressions in
    // MarketsStrip.
    expect(dashboardDefault.markets.length).toBeGreaterThan(0)
    for (const index of dashboardDefault.markets) {
      expect(index.ticker).toBeTruthy()
      expect(index.displayName).toBeTruthy()
      expect(Number.isFinite(index.lastPrice)).toBe(true)
      expect(Number.isFinite(index.pctChange)).toBe(true)
    }
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

  it('watchlist contains every tracked instrument except the primary', () => {
    // ADR 004 layout contract: the active primary is excluded from the
    // watchlist (no duplication between the two surfaces). Every *other*
    // universe member must appear exactly once.
    const primarySymbol = dashboardDefault.primary.instrument.symbol
    const expected = dashboardUniverse
      .filter((row) => row.instrument.symbol !== primarySymbol)
      .map((row) => row.instrument.symbol)
      .sort()
    const got = dashboardDefault.watchlist
      .map((item) => item.instrument.symbol)
      .sort()
    expect(got).toEqual(expected)
  })

  it('every watchlist item has a valid state, a non-empty sparkline, and a numeric pctChange', () => {
    // Sparkline + pctChange are the widget's two glance-read signals
    // (ADR 004 §Watchlist bullet). Zero points or non-numeric %change
    // would render a broken mini row.
    for (const item of dashboardDefault.watchlist) {
      expect(VALID_STATES).toContain(item.state)
      expect(item.sparkline.length).toBeGreaterThan(0)
      expect(typeof item.pctChange).toBe('number')
      expect(Number.isFinite(item.pctChange)).toBe(true)
    }
  })

  it('projectDashboard with a different primarySymbol swaps the focus', () => {
    // The swap mechanic (ADR 004 §Swap is a view-level action) must
    // re-project the same universe: the requested symbol becomes
    // primary, the old primary reappears in the watchlist, and no
    // instrument is ever present in both surfaces at once.
    const originalPrimary = dashboardDefault.primary.instrument.symbol
    const alternate = dashboardDefault.watchlist[0].instrument.symbol
    const projected = projectDashboard(alternate)

    expect(projected.primary.instrument.symbol).toBe(alternate)
    const watchlistSymbols = projected.watchlist.map((i) => i.instrument.symbol)
    expect(watchlistSymbols).not.toContain(alternate)
    expect(watchlistSymbols).toContain(originalPrimary)
  })

  it('news items carry a valid impact tier', () => {
    // impactTier drives badge color in NewsFeed; an unknown value would
    // silently fall through the color mapping.
    for (const item of dashboardDefault.news) {
      expect(VALID_IMPACTS).toContain(item.impactTier)
    }
  })
})
