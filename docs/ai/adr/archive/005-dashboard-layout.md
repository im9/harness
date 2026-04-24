# ADR 005: Dashboard Layout

## Status: Implemented

## Context

ADR 004 set the Phase 1 MVP scope at a sketch level: `/`, `/settings`,
`/login`; four provider abstractions; swap-based single-primary
dashboard with a right-side context column. This ADR fills in the
dashboard layout itself — topology, state banner hierarchy, widget
component boundaries, charting primitives, and the swap mechanics —
so the dashboard route can be built mock-first against a frozen
payload contract independently of backend providers (ADR 008) and
the engine (ADR 007).

The work landed as a sequence of small increments (a)–(h), each
independently demonstrable; the Implementation section below records
what shipped at each step for later readers.

## Decision

### Topology

The dashboard renders the operator's **active primary instrument** as
the hero chart, with every *other* tracked instrument listed as a
mini-row in the Watchlist widget. The route's real estate splits
~70 / 30 between the primary panel on the left and a right-side
context column.

```
┌────────────────────────────────────────────┬─────────────────┐
│ Markets: [N225] [DJIA] [NDX] [SPX] [USDJPY]  ticker·last·%chg │
├────────────────────────────────────────────┼─────────────────┤
│ Nikkei 225 Mini            ● ENTER         │  Watchlist      │
│ NKM · OSE                                  │  - click-to-    │
│ Opening range break · LONG · tgt 38,650    │    swap rows:   │
├────────────────────────────────────────────┤   [tkr] [name]  │
│                                            │   [●state]      │
│  Price chart (candles)                     │   [%chg]        │
│   - VWAP dashed line                       │   [sparkline]   │
│   - Setup range / levels shaded            │   [last price]  │
│   - Target / retreat price lines           │                 │
│   - Setup trigger markers                  │                 │
│   - Macro event vertical band              │                 │
├────────────────────────────────────────────┼─────────────────┤
│  Volume pane                               │  News widget    │
├────────────────────────────────────────────┤  - headline     │
│  Rule gauge: used / cap                    │    list +       │
│                                            │    master-      │
│                                            │    detail       │
└────────────────────────────────────────────┴─────────────────┘
                                                       [AI] FAB
```

Right-column widgets stack vertically (Watchlist above NewsFeed).
Widget order is fixed in Phase 1; reorder / hide is a Future
extension.

### Primary-as-view-mode + swap mechanics

**Primary is a view mode, not a fixed property.** The engine tracks
state for *every* operator-configured instrument; "primary" is simply
the one the dashboard is currently focused on. Click any watchlist
row to promote it to primary — the displaced primary slides back
into the watchlist in its place. This is the only row action in
Phase 1: no detail drawer, no context menu, no keyboard shortcut
(the last is a Future extension). The active primary is excluded
from the watchlist list so the two surfaces never duplicate the same
instrument; the state banner is the single source of "this is what
you are looking at".

**No single-asset-class constraint.** The primary can be any tracked
instrument regardless of asset class (index future, FX cross, US
index future, single stock, …), and the watchlist freely mixes asset
classes. Context indicators (e.g. USD/JPY for a Japan-index primary)
live in the same list as same-asset alternates — whatever the
operator configures.

Simultaneous multi-primary (two or more full charts side-by-side) is
a genuinely different layout concern and stays in Future extensions.

### Top strip — Markets overview

The dashboard's top strip is a read-only row of global benchmark
indices: Nikkei 225, Dow Jones, Nasdaq 100, S&P 500, USD/JPY. Each
renders as a compact card of `ticker · last · pctChange` with
sign-driven color; clicks are inert. These are cash indices, not
tradeable by the operator — a distinct `MarketIndex` type (no
`state`, no `setup`, no swap, no bars) keeps them structurally
separate from `Instrument` so they cannot be promoted to primary or
mixed into the watchlist.

Operator-state surfaces (intraday P&L, session phase, next macro
event countdown) are deliberately absent from Phase 1. A solitary
"-930" on the page reads as opaque noise before the surrounding UI
— journaling, rule-state rationale, session ceremony — exists to
give it meaning; the fields are dropped from the payload and will
return once that context is in place. The per-instrument macro band
on the chart (`InstrumentRowState.macro`) is unaffected — that
window belongs to the primary's chart, not the top strip.

### State banner hierarchy

The banner's job is to make "which instrument is on screen and in
what state" readable at a glance, because the watchlist no longer
shows the active primary. Three tiers, explicit in typography:

1. **Hero line** — instrument display name (largest text on the
   page) with the state badge right-aligned (colored chip +
   ENTER / HOLD / EXIT / RETREAT label).
2. **Sub-line** — ticker · venue, smaller and muted.
3. **Meta strip** — setup name · side · target · retreat, smaller
   still and visually de-emphasized.

This ordering puts "what am I looking at" first and "what are the
setup parameters" third. A swap lands unambiguously because the hero
line is the largest element on the dashboard — the operator cannot
miss which instrument is focused.

### Component boundaries (Phase 1 frontend)

- `PrimaryInstrumentPanel` — state banner + price chart (with all
  annotations) + volume pane + rule gauge bundled as a single
  decision unit. One per page.
- `Watchlist` widget — the *other* tracked instruments (all except
  the active primary) as a vertical list of mini rows. Each row
  shows: ticker · display name · state dot · pctChange from session
  anchor · sparkline · last price. Clicking a row swaps it with the
  current primary; this is the sole row action in Phase 1. The row
  payload (`WatchlistItem`) intentionally omits the heavy per-
  instrument data (bars / indicators / setup / macro) — those live
  on the primary payload only and are recomputed by the backend
  when a swap promotes a new instrument to primary.
- `NewsFeed` widget — streamed headline list with master–detail
  paging inside the widget footprint. Each list row shows the
  impact tag, the **exact JST time** of the headline (alongside a
  relative "Xm ago" for glanceable recency), and the title. If the
  `NewsItem` carries any of `source` / `body` / `url`, the row is
  a button that swaps the widget body to a detail view (back
  control + meta + full title + source + body + external link).
  Inline `<details>` disclosure was tried and discarded — the
  right column is too narrow for comfortable in-row reading of a
  multi-sentence body; paging gives the detail its own full-height
  canvas while the operator stays in the dashboard's visual rhythm
  (no modal, no new tab). Rows without any detail stay as static
  read-only cells (graceful degradation: a partial feed from a
  provider adapter still renders cleanly).
- `AiChatFloat` — floating action button anchored bottom-right
  that morphs into a bottom-right-anchored chat card (see ADR 006).

Charting primitives: **`lightweight-charts`** for the primary
instrument's candles, price lines, markers, and sub-panes (price and
volume). **Tremor Raw** for `CategoryBar` (rule gauge) and
`AreaChart` (watchlist sparklines where we ultimately rolled our own
instead).

### State transitions + mobile

`ENTER` and `RETREAT` transitions on the primary instrument animate
the state banner and fire a browser Notification and the configured
webhook. Watchlist state changes get a softer cue (badge color shift
only; no banner animation, no webhook) so the primary panel stays
the site of attention. No motion during steady state.

Mobile: single column — primary panel first, watchlist and news
widgets stacked below. Chat FAB anchors bottom-right and expands to
full screen. Banner and rule gauge keep vertical priority so a
glance from a locked phone reads the same story.

### Display timezone

The chart's x-axis (`tickMarkFormatter` + `localization.timeFormatter`)
and the NewsFeed row's exact time both read in JST via
`lib/display-timezone.ts`. harness' primary market is JP equities /
futures, so axis labels must read in market time regardless of where
the operator is logged in from. The constant is the seam where a
future Localization Settings panel will plug in a DB-backed value
(covered in the Settings ADR, ADR 009).

## Implementation

Mock-first against a frozen payload contract; wired to the real API
last (kicked to Future extensions pending ADR 008 backend).

- [x] (a) `lib/dashboard-types.ts` payload contract +
      `lib/mocks/dashboard.ts` scenarios + route shell composing
      `StateBanner` and `RuleGauge` (Tremor `CategoryBar`). (The
      original `StatusStrip` shipped here was replaced by
      `MarketsStrip` — see the top-strip pivot below.)
- [x] (b) `lightweight-charts` price and volume panes with
      annotations:
  - [x] Per-row timeframe switcher
  - [x] Target / retreat price lines
  - [x] Trigger markers on originating bars
  - [x] VWAP dashed line
  - [x] Macro event vertical band
  - [x] Setup range shading
  - [x] Volume pane
- [x] (c) Layout reshape (schema v1): `PrimaryInstrumentPanel`
      (left) + right-side widget column. Payload splits into
      `primary: InstrumentRowState`, `watchlist: WatchlistItem[]`,
      `news: NewsItem[]`. `Watchlist` / `NewsFeed` shipped as
      layout-only stubs against this v1 shape. (Superseded below
      by schema v2 once the swap model supersedes the original
      single-primary framing.)
- [x] (d) Schema v2 + realistic mocks. `WatchlistItem` drops the
      heavy per-instrument fields (bars / indicators / setup /
      macro) and gains `pctChange: number` plus a lighter
      `sparkline: SparklinePoint[]`; `state` is retained so every
      tracked instrument carries a recommendation state. The
      `watchlist` array excludes the active primary (layout
      contract: the two surfaces never duplicate). Mock backend
      accepts a `primarySymbol` on snapshot requests and re-shapes
      the payload accordingly. Mock data: Nikkei 225 Mini as
      primary, TOPIX Mini / USD-JPY / S&P 500 E-mini as watchlist
      — realistic enough to read as a real operator session.
- [x] (d.5) Top strip pivot to Markets overview. Deleted the
      operator-state `StatusStrip` (P&L + session phase + next
      macro event) and replaced with `MarketsStrip`: read-only
      row of global benchmark indices (Nikkei 225, Dow Jones,
      Nasdaq 100, S&P 500, USD/JPY). New `MarketIndex` type
      (ticker + displayName + last + pctChange), structurally
      distinct from `Instrument`. Payload drops `intradayPnl`,
      `sessionPhase`, `nextMacroEvent`; adds
      `markets: MarketIndex[]`. Pctchange formatted with leading
      sign and sign-driven color; last-price decimals derived
      heuristically (0 for index-level values, 2 for 10–1000,
      3 for FX-range).
- [x] (e) Swap mechanics. `Dashboard` owns a `primarySymbol`
      state (`undefined` on initial load hands the choice to the
      backend's seed default). `useDashboard({ primarySymbol })`
      and the underlying REST / subscription client carry the
      value through; the mock backend re-projects the payload
      accordingly. The per-instrument `timeframes` map is
      preserved across swaps so each instrument remembers its
      last-chosen cadence. `PriceChart` tracks the active symbol
      in a ref and calls `fitContent` when it changes, so a swap
      never leaves the chart stuck on the previous instrument's
      zoom.
- [x] (f) State banner redesign (three-tier hero / sub / meta as
      described in "State banner hierarchy"). Hero instrument
      name is an `<h1>` and the largest text on the page; ticker
      and venue form the muted sub-line; setup parameters
      (setupName / side / target / retreat) relegate to a
      de-emphasized meta strip. State is communicated via a
      right-aligned pill badge with a colored dot, so the outer
      banner tone stays subtle (RETREAT gets a slightly louder
      treatment for "close now" salience). Required adding
      `Instrument.venue: string` to the payload contract.
- [x] (g) `Watchlist` widget — one mini-row `<button>` per
      non-primary tracked instrument. Row lays out: state dot ·
      ticker + display name (stacked) · pctChange · sparkline ·
      last price. Click invokes the swap handler from the
      Dashboard route. Sparkline is the self-rolled `Sparkline`
      SVG primitive (polyline + last-point dot, emerald / rose
      per sign, flat-series fallback to a center-pinned line) —
      no second `lightweight-charts` instance per row. Last-price
      formatting derives decimals from `instrument.tickSize` so
      the row value agrees with the chart's candle closes for the
      same symbol.
- [x] (h) `NewsFeed` widget — streamed headline list with
      exact-JST time + relative "Xm ago" + title on each row.
      `formatRelativeTime` buckets into `now` / `Xm ago` /
      `Xh ago` / `Xh Ym ago` and clamps future timestamps to
      `now` to survive clock skew. `NewsItem` carries optional
      `source` / `body` / `url`; when any of those is populated
      the row is a button that swaps the widget body to a detail
      view (back control, full meta, full title, source pill,
      body text, external `Read full article →` link).
      Master–detail paging inside the widget footprint beat the
      first-try inline `<details>` disclosure — the right column
      is too narrow for readable in-row bodies, and paging gives
      the detail view its own full-height canvas while keeping
      the operator in the dashboard's visual rhythm (no modal,
      no new tab). Detail is dismissable via the back button or
      Escape; back button receives initial focus for keyboard
      parity. If the viewed item disappears from a subsequent
      payload (stream dropped it), the widget falls back to the
      list — state is derived from `items.find(id)` each render
      so no explicit sync effect is needed. External link carries
      `rel="noopener noreferrer"` + `target="_blank"`. Rows
      without any detail stay as plain read-only cells.

## Considerations

**Swap is a view-level action.** The engine emits state, bars, and
indicators for every tracked instrument on every tick, regardless of
which one the dashboard currently focuses on. The swap simply
re-parameterizes the subscription's `primarySymbol`; the backend
re-projects the same underlying data into the heavy `primary` shape
for the new focus and the lighter `WatchlistItem` shape for the
rest. No tick / state / indicator history is recomputed, and no
engine decision is re-played — swap never changes what the engine
concluded, only what the dashboard is currently showing.

**Mock-first, real API last.** Every frontend increment ran against
`lib/mocks/dashboard.ts` so the UI could be exercised end-to-end
without waiting for the backend providers (ADR 008) or engine
(ADR 007). The real `GET /api/dashboard` + `WebSocket /ws/dashboard`
wire-up is a Future extension below, deliberately deferred until the
backend lands.

## Future extensions

- **Wire frontend to real `GET /api/dashboard` +
  `WebSocket /ws/dashboard`** payload (with `primarySymbol` query /
  message parameter for swap). Blocked on ADR 008 backend providers
  reaching a shippable mock-plus-real registry.
- **Simultaneous multi-primary dashboard** — two or more instruments
  rendered as full decision units side-by-side (distinct from Phase
  1's swap, which keeps a single active). Raises its own concerns:
  per-chart rule attribution, cross-chart event correlation,
  responsive collapse rules. Warrants its own ADR.
- **Keyboard shortcuts for primary swap** — `1-9` or a command
  palette to jump between tracked instruments without reaching for
  the mouse. Deliberately out of Phase 1 (pointer only) but trivial
  to layer on top once the swap handler is stable.
- **News feed expansion** — filter bar, source badges, sentiment
  tag, structured `NewsItem` taxonomy refinements. A natural
  continuation of the Phase 1 read-only list once operator feedback
  shapes which dimensions actually matter.
- **Widget customization** — reorder, hide, or add right-column
  widgets (e.g. correlation matrix, open interest, put-call ratio).
  Phase 1 fixes the order at Watchlist → NewsFeed; a later iteration
  might expose the layout in `/settings`.
- **Dynamic indicator bands** — Bollinger, Keltner, VWAP ±σ, ATR
  channel. Upper and lower series that evolve per bar with an
  optional fill between them. Distinct from Phase 1's static
  `setupRange` (a fixed horizontal band on a setup's context) and
  sits in the indicator pipeline, not the setup schema. Warrants its
  own ADR covering payload shape (likely paired `IndicatorLine`
  entries with a fill directive), per-indicator configuration, and
  chart rendering (two `LineSeries` + a custom primitive or
  area-series fill).
- **Context-surface → chart cross-link.** Originally proposed as a
  "click an HH:MM in a chat reply, pulse a chart marker" feature
  and later pivoted to "click a news headline, pulse the bar at
  its `at` time". Both pivots were retracted: the chat regex path
  is an ad-hoc text-scraping anti-pattern that conventional LLM
  UIs avoid; the news path built a pulse mechanism without a
  validated UX (1.2 s halo is ephemeral, silent no-op when the
  target time is outside the visible range). Revisit only when a
  concrete operator workflow demands it and the full UX (scroll
  chart into view, persistent anchor instead of ephemeral flash)
  is designed first. `lib/display-timezone.ts` survives as the
  useful spin-off.

## Related ADRs

- [ADR 004](004-mvp-scope.md) — Phase 1 MVP scope (this ADR
  realizes the dashboard route declared there).
- [ADR 003](003-ui-foundations.md) — shadcn/ui + Tailwind + charting
  library choices this layout builds on.
- [ADR 006](../006-ai-chat-widget.md) — AiChatFloat widget
  (bottom-right FAB) that anchors to the dashboard.
- **[future] Instrument management ADR** — adding / editing /
  removing tracked instruments; assigning setup-library entries per
  instrument; choosing which instrument boots as the default
  primary. This ADR consumes the result (a ready set of tracked
  instruments in the DB) but does not cover the management UX.
