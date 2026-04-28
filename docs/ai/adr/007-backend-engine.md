# ADR 007: Backend Engine — Trend

## Status: Proposed

## Context

ADR 004's MVP scope (archived) sketched a three-layer engine —
setup / rule / macro — at the topology level. The earlier draft of
this ADR specified that whole topology as Phase 1 work. On audit
(2026-04-25) two of the three layers turned out to lack a Phase 1
data source and the third required operator-private definitions
the public reference cannot ship:

- **Rule overlay** triggers off losses, but harness has no order
  visibility (advisory-only by ADR 004) and journaling is Phase 2
  — the loss-cap and cooldown branches could never fire.
- **Macro overlay** triggers off scheduled events, but the
  EventCalendarProvider's only mock mode (`yaml`) requires
  operator-authored calendars, and the manual-toggle UI surface
  was never spec'd in the dashboard or settings ADRs.
- **Setup engine** required operator-configured setups with
  private threshold values (privacy rule keeps these out of the
  tracked tree), so the public reference could ship only
  "illustrative" setups.

Phase 1 narrows to a single mechanical question: **what is the
trend?** This has a clean input (bars), a clean output (one of
three states), and depends on no trade visibility, no calendar
source, and no operator-private setup definitions. Setups, rule
overlay, and macro overlay become per-feature ADRs added later
once their data sources exist.

## Decision

### Trend engine

Pure `(bars, indicator_config) → TrendState`. The engine itself
holds no state across calls; it consumes a window of bars and
returns one of:

- `up` — directional uptrend with sufficient confidence
- `down` — directional downtrend with sufficient confidence
- `range` — no clear directional signal (or low confidence)

### Phase 1 indicator: linear regression on close prices

For each query, fit `y = a·x + b` over the most recent N bars'
closes (`x = bar index`, `y = close`). Take `slope = a` and
`R²` of the fit:

- `up`    if `slope > 0` AND `R² ≥ min_confidence`
- `down`  if `slope < 0` AND `R² ≥ min_confidence`
- `range` otherwise (low confidence — no trend assertion)

Defaults: `window = 20` bars, `min_confidence = 0.5`. Both
operator-configurable via ADR 009 Settings UI when the panel
lands.

### Determinism

Pure function: same `(bars, indicator_config)` → same
`TrendState`. No wall-clock reads, no RNG, no shared mutable
state. Replay-for-review becomes a straightforward add when
tick / bar log persistence lands (Future extension).

## Considerations

**Why linear regression over SMA crossover.** A single
computation yields direction (slope sign) and confidence (R²)
together; no separate signal is needed for the `range` state.
SMA crossover oscillates near equilibrium and requires
additional logic to declare a flat market.

**Single indicator is sufficient for Phase 1.** Replacement is
operator config, not code. Adding indicators (MACD, ADX, custom
blends) does not require revising this ADR — register a new
computer in the trend engine config.

**No setup / rule / macro layers.** The original three-layer
design required either trade visibility (rule), a defined event
input (macro), or operator-private setup definitions, none of
which Phase 1 has. Each becomes a per-feature ADR layered on
top of this trend core when its data source materializes.

## Implementation

- [ ] Backend: `TrendEngine` — pure
      `(bars, indicator_config) → TrendState`. Phase 1 indicator:
      linear regression on close prices.
- [ ] Backend: extend `MarketDataProvider` with
      `.bars(symbol, timeframe, count)` for bar-window input
      (ADR 008 amendment).
- [ ] Frontend: dashboard banner state model swap
      (4 setup-trigger emissions → `TrendState`); ChatContext
      `rule` field swap to `trend` (ADR 005 / 006 amendment
      pending implementation slice).

## Future extensions

- **News-aware trend confidence (L1)** — when a news headline
  lands within the last N minutes, force `range` (suppress
  trend assertion during news fog). Cheap mechanical add — one
  flag from the NewsProvider, no NLP. Lands as a separate ADR
  once NewsProvider is in steady use.
- **News impact classification (L2)** — distinguish
  central-bank speech / rate decision / general headline via
  rule-based or LLM classification, weight effects accordingly.
  Independent ADR.
- **Sentiment-driven trend bias (L3)** — positive news →
  upward bias on trend confidence. Requires sentiment scoring
  and an evaluation loop. Independent ADR.
- **Setup detection layer** — pattern triggers (opening-range
  break, VWAP reclaim, trend-day continuation, etc.) emitting
  ENTER / EXIT signals on top of `TrendState`. Independent ADR.
- **Rule overlay** — daily loss cap, post-loss cooldown,
  override policy. Depends on trade journaling (independent
  ADR).
- **Macro overlay** — pre / event / post window effects.
  Depends on `EventCalendarProvider` (currently dropped from
  Phase 1 — see ADR 008).
- **Multi-indicator blends** — composite reads with weighted
  agreement across indicators (regression + ADX + volume
  confirmation, etc.).
- **Backtest UI** — replay engine over historical ranges to
  refine thresholds. Engine determinism above is the
  precondition.
- **Tick / bar / state log persistence** — required for backtest
  + post-hoc review.

## Related ADRs

- [ADR 004](archive/004-mvp-scope.md) — Phase 1 MVP scope
  sketch. Phase 1 narrowed to trend-only after the 2026-04-25
  audit.
- [ADR 008](008-backend-providers.md) — `MarketDataProvider`
  feeds the trend engine (bar window).
- [ADR 005](archive/005-dashboard-layout.md) — Dashboard
  banner consumes `TrendState` (was four setup-trigger
  emissions).
- [ADR 006](archive/006-ai-chat-widget.md) — Chat auto-injects
  `TrendState` (was rule state).
