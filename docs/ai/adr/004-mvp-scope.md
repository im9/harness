# ADR 004: MVP Scope — Day-Trade Decision Dashboard

## Status: Proposed

## Context

ADR 001 settled the technology stack and verified an auth path; ADR 003
delivered the UI foundations. The product itself — what harness *does*
once logged in — was not yet defined.

harness' purpose (CLAUDE.md, ADR 001) is to **curb impulsive trading
and enforce rule-based decision-making**. Phase 1 concretizes that into
a single-asset-class **decision dashboard**: a realtime advisory that
flags when a mechanical setup triggers, when exit conditions are met,
and when to retreat. Execution stays manual in the operator's broker
client — harness never routes orders (permanent ADR 001 constraint).

Operator-specific values (instrument list, thresholds, session times,
vendor selection) are not in this repository. They live in the app
database (edited via `/settings`) or in `.env`. This ADR describes
architecture only.

## Decision

### Routes (three)

- `/login` — auth (ADR 001)
- `/` — **Dashboard** (live engine output)
- `/settings` — configuration

The AI chat is a floating panel anchored to the dashboard's bottom
right, invoked on demand and not a route of its own. Notifications
are toasts + webhook push, not a screen. No other routes in Phase 1.

### Recommendation (4 states)

Per tracked instrument, the engine emits:

| State | Meaning | Operator action |
|-------|---------|-----------------|
| `ENTER` | Setup triggered, all conditions satisfied | Evaluate and place manually |
| `HOLD` | In or near a setup, confirmation pending | Wait |
| `EXIT` | Target / take-profit met | Close for profit |
| `RETREAT` | Invalidation or stop hit | Close at a loss now |

These drive the dashboard UI, push notifications, and the AI chat
context.

### Engine layers

- **Setup engine**: mechanical state machines per (instrument × setup),
  tick-driven, pure `(state, tick) → (state, emission)`. Setup library
  is operator-configured; the engine is setup-agnostic.
- **Rule overlay**: daily loss cap (suppresses `ENTER`), post-loss
  cooldown, explicit override. Advisory only — harness does not see
  orders, so these are UI / notification effects, not enforcement. The
  operator remains free to trade in the broker client regardless;
  overrides are logged.
- **Macro overlay**: pre / event / post windows from a calendar
  provider. Pre: suppress new `ENTER`, flag held positions as `HOLD`,
  tighten `RETREAT`. Event: mute signals. Post: reduced recommended
  size on new `ENTER`, tighter `RETREAT`. One-click manual toggle for
  unscheduled headlines.

### Provider abstractions (mock-first)

Four narrow protocols, all swappable:

```
MarketDataProvider    .subscribe / .latest_bar / .session_calendar
EventCalendarProvider .upcoming
NewsProvider          .stream
ChatProvider          .stream
```

`NewsProvider` is distinct from `EventCalendarProvider`: calendar
items are known-in-advance scheduled releases consumed by the macro
overlay; news is streamed headlines rendered in the dashboard's
sidebar widget. In Phase 1 news does not affect engine state — it is
context for the operator and, via the auto-inject, for the AI chat.

**Phase 1 ships mocks only.** Real-vendor adapters live outside the
public tree (separate package, private sibling repo, or gitignored
folder). The public tree must run end-to-end against mocks.

Mock modes:

| Protocol | Modes |
|---|---|
| `MarketDataProvider` | `synthesized` (random walk), `replay` (neutral CSV / Parquet), `scenario` (hand-authored sequences) |
| `EventCalendarProvider` | `yaml` (operator override file) |
| `NewsProvider` | `seeded` (hand-authored headlines with timing + impact tags) |
| `ChatProvider` | `echo` (deterministic), `local` (self-hosted LLM) |

No test, fixture, or example may reference a real adapter by name
(public-repo privacy, CLAUDE.md rule).

### Persistence (what survives a restart)

- **Persisted**: configuration only, in SQLite (instruments, sessions,
  rule parameters, setup params, provider selection, notifications).
- **Not persisted**: ticks, bars, recommendations, rule-state
  transitions, AI chat, news headlines, P&L. All in-memory, reset at
  restart.

Journaling is deferred. Without persistence of recommendation / rule
logs, harness has no history surface in Phase 1 — no review screen, no
session archive. Revisit when Phase 2 analytics needs (hit rate,
R distribution, rule effectiveness) justify the schema work.

### Configuration boundary

- No operator-specific literals in source code.
- Operator values live in the DB (edited via `/settings`); secrets in
  `.env` (the Settings UI references secrets by env-var name, never
  exposes the value itself).
- Required fields default to a structurally safe empty (engine emits
  nothing) rather than a guess.
- Optional CLI YAML import / export for bootstrap and backup
  (gitignored).
- **Privacy boundary for fixtures and documentation.** Public market
  identifiers (Nikkei 225, TOPIX, USD/JPY, S&P 500, WTI crude, etc.)
  are permitted in mocks, tests, fixtures, and ADR examples —
  without them the UI and its tests cannot communicate what a real
  session looks like. What must not appear in tracked code is the
  *operator-specific* layer: which subset they actually track,
  their threshold values, session specifics, setup choices, and
  vendor selection. Those live only in the DB and `.env`.

### Settings UI

One panel per concern, persisted on save, validated via shared
Pydantic schemas:

Sessions · Rule overlay · Setup library · Macro overlay · Market-data
provider · Event-calendar provider · News provider · AI chat
provider · Notifications.

Provider panels expose a "test connection" button. A failing test does
not block save — the panel is marked "unverified".

**Instrument management** — adding / removing / editing the set of
tracked instruments and wiring them to setup-library entries — is
deliberately out of scope for ADR 004 and lives in a **separate
ADR**. That ADR will cover the full add / edit / remove UX, including
which instrument boots as primary on page load. ADR 004 assumes the
set of tracked instruments already exists in the DB; the dashboard
chooses the first entry as the initial primary and otherwise relies
on the swap mechanics described below.

### AI chat (floating, user-initiated)

- Never pushes proactively — responds only to operator-submitted
  messages.
- Cannot mutate rule state (structural, not prompt-driven: rule state
  is computed upstream of the chat request and has no writable channel
  back).
- Session-only; no persistence.
- Auto-injected per turn (prompt-cached): current price / VWAP /
  setup state for the active primary, current recommendation and
  reason, watchlist snapshot (ticker + state + last price + pctChange
  per tracked instrument, active primary excluded to avoid
  duplication), markets snapshot (global benchmark indices with
  last + pctChange), rule state (used / cap), recent news headlines.
- Text in, text out. No tool use in Phase 1.
- **UI**: a floating action button anchored to the dashboard's
  bottom-right corner. Click expands into a right-aligned slide-in
  panel (~400–500 px wide). The dashboard stays fully visible under
  the panel (no dim overlay) so the operator can keep reading the
  chart while composing a question about it; close returns the
  dashboard to its uninterrupted view. Mobile collapses the panel to
  full screen.

### Dashboard layout

The dashboard renders the operator's **active primary instrument** as
the hero chart, with every *other* tracked instrument listed as a
mini-row in the Watchlist widget. The route's real estate splits
~70 / 30 between the primary panel on the left and a right-side
context column.

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

**Top strip — Markets overview.** The dashboard's top strip is a
read-only row of global benchmark indices: Nikkei 225, Dow Jones,
Nasdaq 100, S&P 500, USD/JPY. Each renders as a compact card of
`ticker · last · pctChange` with sign-driven color; clicks are
inert. These are cash indices, not tradeable by the operator —
a distinct `MarketIndex` type (no `state`, no `setup`, no swap,
no bars) keeps them structurally separate from `Instrument` so
they cannot be promoted to primary or mixed into the watchlist.

Operator-state surfaces (intraday P&L, session phase, next macro
event countdown) are deliberately absent from Phase 1. A solitary
"-930" on the page reads as opaque noise before the surrounding
UI — journaling, rule-state rationale, session ceremony — exists
to give it meaning; the fields are dropped from the payload and
will return once that context is in place. The per-instrument
macro band on the chart (`InstrumentRowState.macro`) is
unaffected — that window belongs to the primary's chart, not the
top strip.

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
│  Rule gauge: used / cap                    │    list:        │
│                                            │    impact tag + │
│                                            │    time + title │
└────────────────────────────────────────────┴─────────────────┘
                                                       [AI] FAB
```

**State banner hierarchy.** The banner's job is to make "which
instrument is on screen and in what state" readable at a glance,
because the watchlist no longer shows the active primary. Three
tiers, explicit in typography:

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

Component boundaries (Phase 1 frontend):

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
- `NewsFeed` widget — streamed headline list (impact tag + time +
  title). Read-only in Phase 1 — filter, source badges, sentiment,
  click-through detail are Future extensions.
- `AiChatFloat` — floating action button anchored bottom-right;
  expands into a right-aligned slide-in panel as described in the AI
  chat section.

Right-column widgets stack vertically (Watchlist above NewsFeed).
Widget order is fixed in Phase 1; reorder / hide is a Future
extension.

Charting primitives: **`lightweight-charts`** for the primary
instrument's candles, price lines, markers, and sub-panes (price and
volume). **Tremor Raw** for `CategoryBar` (rule gauge) and
`AreaChart` (status-strip sparkline, watchlist sparklines).

`ENTER` and `RETREAT` transitions on the primary instrument animate
the state banner and fire a browser Notification and the configured
webhook. Watchlist state changes get a softer cue (badge color shift
only; no banner animation, no webhook) so the primary panel stays
the site of attention. No motion during steady state.

Mobile: single column — primary panel first, watchlist and news
widgets stacked below. Chat FAB anchors bottom-right and expands to
full screen. Banner and rule gauge keep vertical priority so a
glance from a locked phone reads the same story.

## What Phase 1 does NOT include

- Trade journaling / executed-trade logging (deferred)
- Automated order placement (permanent, ADR 001)
- Backtest UI (logic is backtestable offline; no UI module in Phase 1)
- Multi-asset-class portfolio view
- **Simultaneous** multi-primary (two or more full charts visible
  side-by-side). Phase 1 ships single-active-with-swap; a genuine
  multi-chart grid is a different UX concern and lives in Future
  extensions.
- Instrument management UI (add / edit / remove tracked instruments,
  assign setup library entries per instrument) — covered by a
  separate ADR
- History / review / archive screens (no persistence → no surface)

## Implementation

Ordered so each step is independently demonstrable. Frontend builds
mock-first against the payload contract; backend follows.

- [ ] Backend: Pydantic config schema (instruments, sessions, rule,
      setup library, macro, providers, notifications)
- [ ] Backend: config persistence in SQLite + migration story
- [ ] Backend: `GET /api/settings`, `PUT /api/settings`, per-provider
      "test connection" endpoints
- [ ] Backend: `MarketDataProvider` + registry + mock (synthesized /
      replay / scenario) + in-memory tick / bar ring buffer
- [ ] Backend: `EventCalendarProvider` + registry + mock (YAML)
- [ ] Backend: `NewsProvider` + registry + mock (seeded) + SSE
- [ ] Backend: `ChatProvider` + registry + mock (echo / local) + SSE
- [ ] Backend: `SetupEngine` — starter setups as tick-driven pure
      state machines
- [ ] Backend: `RuleOverlay` (cap, cooldown, overrides)
- [ ] Backend: `MacroOverlay` (event-window effects)
- [ ] Backend: `GET /api/dashboard` + `WebSocket /ws/dashboard`
      (primary + watchlist + news + engine outputs in a single
      payload)
- [ ] Frontend (on ADR 003 scaffold): `/settings` — schema-driven
      forms per section, test-connection feedback, persist on save
- [ ] Frontend: `/` dashboard — single primary + right-column
      widgets, mock-first against a frozen payload contract, wired to
      the real API last:
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
        `markets: MarketIndex[]`. Pctchange formatted with
        leading sign and sign-driven color; last-price decimals
        derived heuristically (0 for index-level values, 2 for
        10–1000, 3 for FX-range).
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
        Dashboard route. Sparkline is the self-rolled
        `Sparkline` SVG primitive (polyline + last-point dot,
        emerald / rose per sign, flat-series fallback to a
        center-pinned line) — no second `lightweight-charts`
        instance per row. Last-price formatting derives decimals
        from `instrument.tickSize` so the row value agrees with
        the chart's candle closes for the same symbol.
  - [x] (h) `NewsFeed` widget — streamed headline list (impact tag
        + relative time + title). Each row stacks the tag + time on
        one line over the headline on a second so long titles wrap
        without pushing the tag off-screen. `formatRelativeTime`
        buckets into `now` / `Xm ago` / `Xh ago` / `Xh Ym ago` and
        clamps future timestamps to `now` to survive clock skew.
        Read-only; filter, source badges, sentiment, click-through
        detail remain Future extensions.
  - [ ] (i) `AiChatFloat` — FAB bottom-right → right-aligned
        slide-in panel. SSE consumer; cross-link to chart markers
        when the AI references a chart element by time ("the sweep
        at 14:23" pulses the corresponding marker).
  - [ ] Wire to the real `GET /api/dashboard` /
        `WebSocket /ws/dashboard` payload (with `primarySymbol`
        query / message parameter for swap).
- [ ] CLI: `harness config import / export <yaml>`
- [ ] E2E on mocks: scenario-driven session exercises the full
      pipeline (tick → engine → recommendation → UI → chat context)
- [ ] Real-vendor adapter (outside public tree); live dry-run

## Considerations

**Determinism.** Every recommendation must be reproducible from the
tick log + rule state. No wall-clock reads in engine logic, no random
tiebreaks, no mutable shared state. Since Phase 1 does not persist the
tick log, this is an invariant on the engine's *shape*, not a
historical audit trail.

**Swap is a view-level action.** The engine emits state, bars, and
indicators for every tracked instrument on every tick, regardless of
which one the dashboard currently focuses on. The swap simply
re-parameterizes the subscription's `primarySymbol`; the backend
re-projects the same underlying data into the heavy `primary` shape
for the new focus and the lighter `WatchlistItem` shape for the
rest. No tick / state / indicator history is recomputed, and no
engine decision is re-played — swap never changes what the engine
concluded, only what the dashboard is currently showing.

**AI guardrail is structural.** Rule state is computed upstream of the
chat request; the AI's output channel is text back to the operator
and has no path to mutate rule state. System-prompt framing is
secondary defense.

**Starter setup library is illustrative.** Phase 1 ships mechanically
clear setups for ease of verification, not as the operator's edge.
Expect replacement during live use; setup additions are
configuration, not code, and should not require ADR revision.

**Data-source selection is deployment-private.** The protocol is
narrow so the concrete adapter is reversible. Trade-offs among
candidate vendors (cost, account friction, API maturity) are
operator-specific and out of the public tree.

**Compliance framing.** harness is a private, single-user tool served
over an authenticated tunnel (ADR 001). It is not marketed, not
offered to third parties. Output phrasing favors descriptive ("setup
triggered, conditions are X, Y, Z") over prescriptive ("you should
buy") as cheap insurance on top of the private-access model.

## Future extensions

- **Journaling** (Phase 2) — executed-trade logging,
  recommendation-vs-actual analysis.
- **Tick / recommendation / rule-state log persistence** — enables
  post-hoc analytics (hit rate, R distribution, rule effectiveness).
  Natural precursor to a review screen.
- **Setup-library expansion** — additional setups as operator-private
  configuration; generic setup *categories* may warrant their own ADR.
- **Backtest UI** — run the setup engine over historical ranges,
  refine thresholds.
- **AI tool use** (Phase 2) — backtest-on-demand, similar-day search,
  event-impact history.
- **Additional asset-class phases** — FX, long-term equities, EOD
  modes. Each phase is a successor ADR.
- **Setup-performance feedback loop** — surface the worst-performing
  setup of the prior period and prompt for retune / retire.
- **Dynamic indicator bands** — Bollinger, Keltner, VWAP ±σ, ATR
  channel. Upper and lower series that evolve per bar with an
  optional fill between them. Distinct from Phase 1's static
  `setupRange` (a fixed horizontal band on a setup's context) and
  sits in the indicator pipeline, not the setup schema. Warrants its
  own ADR covering payload shape (likely paired `IndicatorLine`
  entries with a fill directive), per-indicator configuration, and
  chart rendering (two `LineSeries` + a custom primitive or
  area-series fill).
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
  tag, click-through detail panel. A natural continuation of the
  Phase 1 read-only list once operator feedback shapes which
  dimensions actually matter.
- **Widget customization** — reorder, hide, or add right-column
  widgets (e.g. correlation matrix, open interest, put-call ratio).
  Phase 1 fixes the order at Watchlist → NewsFeed; a later iteration
  might expose the layout in `/settings`.

## Related ADRs

- **[future] Instrument management ADR** — adding, editing, and
  removing tracked instruments; assigning setup-library entries per
  instrument; choosing which instrument boots as the default
  primary. ADR 004 consumes the result (a ready set of tracked
  instruments in the DB) but does not cover the management UX.
  Until that ADR lands, operators seed the instrument list via the
  CLI YAML import or direct DB edits.
