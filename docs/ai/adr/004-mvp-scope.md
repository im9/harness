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

### Settings UI

One panel per concern, persisted on save, validated via shared
Pydantic schemas:

Instruments (primary + watchlist) · Sessions · Rule overlay · Setup
library · Macro overlay · Market-data provider · Event-calendar
provider · News provider · AI chat provider · Notifications.

Provider panels expose a "test connection" button. A failing test does
not block save — the panel is marked "unverified".

### AI chat (floating, user-initiated)

- Never pushes proactively — responds only to operator-submitted
  messages.
- Cannot mutate rule state (structural, not prompt-driven: rule state
  is computed upstream of the chat request and has no writable channel
  back).
- Session-only; no persistence.
- Auto-injected per turn (prompt-cached): current price / VWAP /
  setup state for the primary instrument, current recommendation and
  reason, watchlist snapshot (symbols + state badges + last prices),
  today's P&L and distance to cap, upcoming macro events, recent news
  headlines.
- Text in, text out. No tool use in Phase 1.
- **UI**: a floating action button anchored to the dashboard's
  bottom-right corner. Click expands into a right-aligned slide-in
  panel (~400–500 px wide). The dashboard stays fully visible under
  the panel (no dim overlay) so the operator can keep reading the
  chart while composing a question about it; close returns the
  dashboard to its uninterrupted view. Mobile collapses the panel to
  full screen.

### Dashboard layout

Phase 1 centers on a **single primary instrument**
(operator-configured via `/settings`, Nikkei futures as the bootstrap
target). The route's real estate splits ~70 / 30 between a
primary-instrument panel on the left and a right-side context column.
Multi-primary layouts are deliberately out of scope for Phase 1 —
different asset classes (stocks, FX) are expected to grow their own
page shapes and will live in successor ADRs rather than being
retrofitted here.

Top status strip (full width): today's P&L (Tremor `AreaChart`
sparkline + the current number), session phase, next macro event +
countdown.

```
┌────────────────────────────────────────────┬─────────────────┐
│ StatusStrip: P&L sparkline, phase, next macro event          │
├────────────────────────────────────────────┼─────────────────┤
│ State banner (setup name, side, R target)  │  Watchlist      │
├────────────────────────────────────────────┤  widget         │
│                                            │  - mini row     │
│  Price chart (candles)                     │    per secondary│
│   - VWAP dashed line                       │    instrument:  │
│   - Setup range / levels shaded            │    state badge, │
│   - Target / retreat price lines           │    last price,  │
│   - Setup trigger markers                  │    sparkline    │
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

Component boundaries (Phase 1 frontend):

- `PrimaryInstrumentPanel` — state banner + price chart (with all
  annotations) + volume pane + rule gauge bundled as a single
  decision unit. One per page.
- `Watchlist` widget — N secondary instruments as a vertical list of
  mini rows (state badge + last price + sparkline). Context, not
  decision units: no full chart, no per-row timeframe switcher.
  Operator-configured from the DB.
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
- Multi-primary dashboard (two+ full charts side-by-side) — defer to a
  successor ADR when a second asset class warrants its own page
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
        `StateBanner`, `RuleGauge` (Tremor `CategoryBar`), and
        `StatusStrip` (Tremor `AreaChart`).
  - [x] (b) `lightweight-charts` price and volume panes with
        annotations:
    - [x] Per-row timeframe switcher
    - [x] Target / retreat price lines
    - [x] Trigger markers on originating bars
    - [x] VWAP dashed line
    - [x] Macro event vertical band
    - [x] Setup range shading
    - [x] Volume pane
  - [ ] (c) Layout reshape: `PrimaryInstrumentPanel` (left) +
        right-side widget column. Payload contract replaces
        `rows: InstrumentRowState[]` with `primary: InstrumentRowState`,
        `watchlist: WatchlistItem[]` (lighter shape — state badge,
        last price, sparkline points), and `news: NewsItem[]`.
  - [ ] (d) `Watchlist` widget — mini row per secondary instrument
        (state badge + last price + sparkline). No full chart; reuses
        a lightweight sparkline primitive rather than instantiating a
        second `lightweight-charts` chart per row.
  - [ ] (e) `NewsFeed` widget — streamed headline list (impact tag +
        time + title). Read-only.
  - [ ] (f) `AiChatFloat` — FAB bottom-right → right-aligned slide-in
        panel. SSE consumer; cross-link to chart markers when the AI
        references a chart element by time ("the sweep at 14:23"
        pulses the corresponding marker).
  - [ ] Wire to the real `GET /api/dashboard` /
        `WebSocket /ws/dashboard` payload.
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
- **Multi-primary dashboard** — two instruments side-by-side, or a
  grid of primaries. Likely tied to asset-class-specific pages
  (stock dashboard ≠ futures dashboard); a successor ADR per asset
  class is more natural than retrofitting the Phase 1 single-primary
  shell.
- **News feed expansion** — filter bar, source badges, sentiment
  tag, click-through detail panel. A natural continuation of the
  Phase 1 read-only list once operator feedback shapes which
  dimensions actually matter.
- **Widget customization** — reorder, hide, or add right-column
  widgets (e.g. correlation matrix, open interest, put-call ratio).
  Phase 1 fixes the order at Watchlist → NewsFeed; a later iteration
  might expose the layout in `/settings`.
